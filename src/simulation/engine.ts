import {
  BATTERY,
  CONTROL,
  DRIVETRAIN,
  LIMITS,
  MG2_REDUCTION,
  POWER_SPLIT,
  VEHICLE,
  maxVehicleSpeedMps,
} from './constants'
import { carrierRangeForMg1, clamp, planetaryResidual, resolveCarrierRpm } from './planetary'
import type {
  DriverInputs,
  EnergyFlow,
  EngineState,
  PowerDiagnostics,
  SimulationState,
  SimulationStepResult,
  SimulationTelemetry,
  SystemObjective,
  VehicleMotionState,
} from './types'

const TWO_PI = Math.PI * 2
const EPSILON = 1e-9

export const DEFAULT_DRIVER_INPUTS: DriverInputs = {
  accelerator: 0,
  brake: 0,
  selector: 'P',
  roadGradePercent: 0,
}

const MOTION_COPY: Record<VehicleMotionState, { label: string; description: string }> = {
  STATIONARY: { label: 'Stationary', description: 'The road wheels are stationary.' },
  ACCELERATING: { label: 'Accelerating', description: 'Net wheel force is increasing vehicle speed.' },
  CRUISING: { label: 'Cruising', description: 'Propulsion approximately balances road load.' },
  COASTING: { label: 'Coasting', description: 'No braking is requested; road load changes speed naturally.' },
  BRAKING: { label: 'Braking', description: 'Regeneration, engine braking, or friction braking is reducing road speed.' },
  REVERSING: { label: 'Reversing', description: 'The road wheels and vehicle are moving in the reverse direction.' },
}

const OBJECTIVE_COPY: Record<SystemObjective, { label: string; description: string }> = {
  ENGINE_OFF: { label: 'Engine off', description: 'The engine is not producing combustion torque.' },
  STARTING: { label: 'Starting engine', description: 'MG1 is performing a bounded engine-start transient.' },
  IDLING: { label: 'Engine idling', description: 'The fueled engine is completing its minimum run while carrying essential load.' },
  WARM_UP: { label: 'Engine warm-up', description: 'The engine is running to reach its warm operating range.' },
  PROPULSION: { label: 'Engine propulsion', description: 'The engine is contributing to road propulsion.' },
  EV_PROPULSION: { label: 'EV propulsion', description: 'Battery power is driving MG2 while the engine remains unfueled.' },
  CHARGING: { label: 'Charging battery', description: 'The latched charge objective is using engine power to replenish the battery.' },
  ASSISTING: { label: 'Electrical assist', description: 'Battery power assists the fueled engine during strong propulsion demand.' },
  REGENERATING: { label: 'Regenerating', description: 'MG2 is converting vehicle motion into electrical charging power.' },
  ENGINE_BRAKING: { label: 'Engine braking', description: 'The unfueled engine is absorbing pumping work in B mode.' },
  MG1_PROTECTION: { label: 'MG1 protection', description: 'Carrier speed is being controlled to keep MG1 within its speed limit.' },
}

export interface InitialSimulationOptions {
  vehicleSpeedKph?: number
  vehicleSpeedMps?: number
  batterySoc?: number
  engineTemperatureC?: number
  engineState?: EngineState
  engineRpm?: number
  chargeRequestActive?: boolean
  protectedReserveEnergyKwh?: number
}

export function createInitialSimulationState(options: InitialSimulationOptions = {}): SimulationState {
  const batterySoc = clamp(options.batterySoc ?? 58, BATTERY.hardLowerSoc, BATTERY.hardUpperSoc)
  const vehicleSpeedMps = clamp(
    options.vehicleSpeedMps ?? (options.vehicleSpeedKph ?? 0) / 3.6,
    -maxVehicleSpeedMps,
    maxVehicleSpeedMps,
  )
  const engineState = options.engineState ?? 'OFF'
  const initialObjective: SystemObjective = engineState === 'CRANKING'
    ? 'STARTING'
    : engineState === 'FUELED' ? 'IDLING' : 'ENGINE_OFF'
  const engineRpm = clamp(options.engineRpm ?? (engineState === 'FUELED' ? 1_300 : 0), 0, LIMITS.engineRpm)
  const kinematics = calculateKinematics(vehicleSpeedMps, engineRpm)
  return {
    timeSeconds: 0,
    vehicleSpeedMps,
    vehiclePositionM: 0,
    vehicleAccelerationMps2: 0,
    batterySoc,
    batteryEnergyKwh: BATTERY.nominalCapacityKwh * batterySoc / 100,
    protectedReserveEnergyKwh: clamp(
      options.protectedReserveEnergyKwh ?? BATTERY.protectedReserveCapacityKwh,
      0,
      BATTERY.protectedReserveCapacityKwh,
    ),
    engineState,
    engineRpm: kinematics.carrierRpm,
    engineTorqueNm: 0,
    mg1Rpm: kinematics.mg1Rpm,
    mg1TorqueNm: 0,
    mg2Rpm: kinematics.mg2Rpm,
    mg2TorqueNm: 0,
    engineTemperatureC: clamp(options.engineTemperatureC ?? 82, CONTROL.ambientTemperatureC, 110),
    chargeRequestActive: options.chargeRequestActive ?? batterySoc <= BATTERY.chargeRequestSoc,
    warmupRequestActive: (options.engineTemperatureC ?? 82) < CONTROL.warmupStartC,
    vehicleMotionState: Math.abs(vehicleSpeedMps) < 0.15
      ? 'STATIONARY'
      : vehicleSpeedMps < 0 ? 'REVERSING' : 'COASTING',
    systemObjective: initialObjective,
    motionStateTimerSeconds: CONTROL.classificationMinimumSeconds,
    systemObjectiveTimerSeconds: CONTROL.classificationMinimumSeconds,
    pendingVehicleMotionState: Math.abs(vehicleSpeedMps) < 0.15
      ? 'STATIONARY'
      : vehicleSpeedMps < 0 ? 'REVERSING' : 'COASTING',
    pendingSystemObjective: initialObjective,
    pendingMotionStateTimerSeconds: 0,
    pendingSystemObjectiveTimerSeconds: 0,
    crankingTimerSeconds: 0,
    crankingWorkKj: 0,
    crankingDeliveredPowerKw: 0,
    engineOnTimerSeconds: engineState === 'FUELED' ? CONTROL.minimumEngineOnSeconds : 0,
    engineOffTimerSeconds: engineState === 'OFF' ? CONTROL.minimumEngineOffSeconds + 1 : 0,
    stoppingTimerSeconds: 0,
    parkLockEngaged: Math.abs(vehicleSpeedMps) < 0.15,
  }
}

export function speedToWheelRpm(speedMps: number) {
  return speedMps / (TWO_PI * VEHICLE.wheelRadiusM) * 60
}

export function calculateKinematics(speedMps: number, carrierRpm: number) {
  const wheelRpm = speedToWheelRpm(speedMps)
  const ringRpm = wheelRpm * DRIVETRAIN.finalDriveRatio
  const resolved = resolveCarrierRpm(ringRpm, carrierRpm)
  // Fixed carrier: Nr * ringRPM + Ns * sunRPM = 0. MG2 is the sun.
  const mg2Rpm = -ringRpm * DRIVETRAIN.mg2ReductionRatio
  return {
    wheelRpm,
    ringRpm,
    carrierRpm: resolved.carrierRpm,
    mg1Rpm: resolved.mg1Rpm,
    mg2Rpm,
    mg1LimitActive: resolved.limitActive,
  }
}

function approach(current: number, target: number, maximumDelta: number) {
  if (target > current) return Math.min(target, current + maximumDelta)
  return Math.max(target, current - maximumDelta)
}

function sanitizeInputs(inputs: DriverInputs): DriverInputs {
  return {
    accelerator: clamp(inputs.accelerator, 0, 1),
    brake: clamp(inputs.brake, 0, 1),
    selector: inputs.selector,
    roadGradePercent: clamp(inputs.roadGradePercent, -18, 18),
  }
}

function terminalDischargeLimitKw(state: SimulationState, dt: number) {
  const socFactor = clamp((state.batterySoc - BATTERY.hardLowerSoc) / 5, 0, 1)
  const minimumEnergy = BATTERY.nominalCapacityKwh * BATTERY.hardLowerSoc / 100
  const energyHeadroom = Math.max(0, state.batteryEnergyKwh - minimumEnergy)
  const energyLimit = dt > 0
    ? energyHeadroom * 3_600 * BATTERY.dischargeEfficiency / dt
    : BATTERY.maxDischargeKw
  return Math.min(BATTERY.maxDischargeKw * socFactor, energyLimit)
}

function terminalChargeLimitKw(state: SimulationState, dt: number) {
  const socFactor = state.batterySoc < BATTERY.regenTaperSoc
    ? 1
    : clamp((BATTERY.hardUpperSoc - state.batterySoc) / (BATTERY.hardUpperSoc - BATTERY.regenTaperSoc), 0, 1)
  const maximumEnergy = BATTERY.nominalCapacityKwh * BATTERY.hardUpperSoc / 100
  const energyHeadroom = Math.max(0, maximumEnergy - state.batteryEnergyKwh)
  const energyLimit = dt > 0
    ? energyHeadroom * 3_600 / (BATTERY.chargeEfficiency * dt)
    : BATTERY.maxChargeKw
  return Math.min(BATTERY.maxChargeKw * socFactor, energyLimit)
}

function protectedReserveLimitKw(state: SimulationState, dt: number) {
  const energyLimit = dt > 0
    ? state.protectedReserveEnergyKwh * 3_600 / dt
    : BATTERY.protectedReserveMaxPowerKw
  return Math.min(BATTERY.protectedReserveMaxPowerKw, energyLimit)
}

function protectedReserveRechargeLimitKw(state: SimulationState, dt: number) {
  const headroomKwh = Math.max(0, BATTERY.protectedReserveCapacityKwh - state.protectedReserveEnergyKwh)
  const energyLimit = dt > 0
    ? headroomKwh * 3_600 / dt
    : BATTERY.protectedReserveMaxRechargeKw
  return Math.min(BATTERY.protectedReserveMaxRechargeKw, energyLimit)
}

function engineTorqueLimitNm(rpm: number) {
  if (rpm < 650) return 0
  const powerLimited = LIMITS.enginePowerKw * 1_000 / (rpm * TWO_PI / 60)
  const lowSpeedFactor = clamp((rpm - 650) / 600, 0.25, 1)
  return Math.min(LIMITS.engineTorqueNm * lowSpeedFactor, powerLimited)
}

function motorPort(mechanicalPowerKw: number, torqueNm: number, torqueLimitNm: number) {
  const active = Math.abs(mechanicalPowerKw) > 0.005 || Math.abs(torqueNm) > 0.05
  const torqueLossKw = active ? 0.06 + 0.65 * Math.pow(Math.abs(torqueNm) / Math.max(torqueLimitNm, 1), 2) : 0
  let motorLossKw: number
  if (mechanicalPowerKw >= 0) {
    motorLossKw = mechanicalPowerKw * (1 / DRIVETRAIN.motorEfficiency - 1) + torqueLossKw
  } else {
    motorLossKw = -mechanicalPowerKw * (1 - DRIVETRAIN.motorEfficiency) + torqueLossKw
    motorLossKw = Math.min(motorLossKw, Math.max(0, -mechanicalPowerKw))
  }
  return { electricalPowerKw: mechanicalPowerKw + motorLossKw, motorLossKw }
}

interface Allocation {
  engineMechanicalPowerKw: number
  mg1MechanicalPowerKw: number
  mg1ElectricalPowerKw: number
  mg2MechanicalPowerKw: number
  mg2ElectricalPowerKw: number
  mg1TorqueNm: number
  mg2TorqueNm: number
  motorLossKw: number
  inverterLossKw: number
  inverterThroughputKw: number
  batteryTerminalPowerKw: number
  drivetrainLossKw: number
  enginePumpingLossKw: number
  accessoryPowerKw: number
  protectedReservePowerKw: number
  mechanicalResidualKw: number
  electricalResidualKw: number
}

interface AllocationContext {
  engineRpm: number
  mg1Rpm: number
  mg2Rpm: number
  engineTorqueNm: number
  drivetrainWheelPowerKw: number
  enginePumpingLossKw: number
  requestedMg2TorqueNm: number
  accessoryPowerKw: number
  mg1CrankingPowerKw: number
  protectedReserveAvailablePowerKw: number
  protectedReserveRechargeLimitKw: number
  usableBatteryDischargeLimitKw: number
}

interface FeasibilityLimits {
  dischargeLimitKw: number
  chargeLimitKw: number
  inverterLimitKw: number
  componentSafetyFactor: number
}

function allocatePower(context: AllocationContext): Allocation {
  const engineOmega = context.engineRpm * TWO_PI / 60
  const mg1Omega = context.mg1Rpm * TWO_PI / 60
  const mg2Omega = context.mg2Rpm * TWO_PI / 60
  const engineMechanicalPowerKw = context.engineTorqueNm * engineOmega / 1_000
  const planetaryMg1TorqueNm = -context.engineTorqueNm * POWER_SPLIT.sunTeeth
    / (POWER_SPLIT.ringTeeth + POWER_SPLIT.sunTeeth)
  // Cranking is torque-controlled. Recomputing power from the reported RPM
  // prevents an old-speed power request from exceeding the post-step torque limit.
  const crankTorqueNm = context.mg1CrankingPowerKw > 0 && Math.abs(mg1Omega) > EPSILON
    ? Math.sign(mg1Omega) * Math.min(
      LIMITS.mg1TorqueNm * 0.86,
      48,
      context.mg1CrankingPowerKw * 1_000 / Math.abs(mg1Omega),
    )
    : 0
  const mg1TorqueNm = planetaryMg1TorqueNm + crankTorqueNm
  const mg1MechanicalPowerKw = mg1TorqueNm * mg1Omega / 1_000
  const drivetrainLossKw = Math.abs(context.drivetrainWheelPowerKw) * (1 / DRIVETRAIN.mechanicalEfficiency - 1)
  const crankPumpingLossKw = context.mg1CrankingPowerKw > 0 ? Math.max(0, mg1MechanicalPowerKw) : 0
  const enginePumpingLossKw = context.enginePumpingLossKw + crankPumpingLossKw
  const mg2MechanicalPowerKw = context.drivetrainWheelPowerKw
    + drivetrainLossKw
    + enginePumpingLossKw
    - engineMechanicalPowerKw
    - mg1MechanicalPowerKw
  const mg2TorqueFromPower = Math.abs(mg2Omega) > 1e-6
    ? mg2MechanicalPowerKw * 1_000 / mg2Omega
    : context.requestedMg2TorqueNm
  const mg2TorqueNm = Number.isFinite(mg2TorqueFromPower) ? mg2TorqueFromPower : context.requestedMg2TorqueNm
  const mg1 = motorPort(mg1MechanicalPowerKw, mg1TorqueNm, LIMITS.mg1TorqueNm)
  const mg2 = motorPort(mg2MechanicalPowerKw, mg2TorqueNm, LIMITS.mg2TorqueNm)
  const inverterThroughputKw = Math.abs(mg1.electricalPowerKw) + Math.abs(mg2.electricalPowerKw)
  const inverterLossKw = inverterThroughputKw * (1 / DRIVETRAIN.inverterEfficiency - 1)
  const grossBusPowerKw = mg1.electricalPowerKw + mg2.electricalPowerKw
    + context.accessoryPowerKw + inverterLossKw
  const mg1InverterShareKw = inverterLossKw * Math.abs(mg1.electricalPowerKw)
    / Math.max(EPSILON, inverterThroughputKw)
  const protectedEligiblePowerKw = context.accessoryPowerKw + (context.mg1CrankingPowerKw > 0
    ? Math.max(0, mg1.electricalPowerKw) + mg1InverterShareKw
    : 0)
  const protectedReserveSupplyPowerKw = Math.min(
    context.protectedReserveAvailablePowerKw,
    protectedEligiblePowerKw,
    Math.max(0, grossBusPowerKw - context.usableBatteryDischargeLimitKw),
  )
  const protectedReserveRechargePowerKw = Math.min(
    context.protectedReserveRechargeLimitKw,
    Math.max(0, -grossBusPowerKw),
  )
  const protectedReservePowerKw = protectedReserveSupplyPowerKw - protectedReserveRechargePowerKw
  const batteryTerminalPowerKw = grossBusPowerKw - protectedReservePowerKw
  const mechanicalResidualKw = engineMechanicalPowerKw + mg1MechanicalPowerKw + mg2MechanicalPowerKw
    - context.drivetrainWheelPowerKw - drivetrainLossKw - enginePumpingLossKw
  const electricalResidualKw = batteryTerminalPowerKw + protectedReservePowerKw
    - mg1.electricalPowerKw - mg2.electricalPowerKw
    - context.accessoryPowerKw - inverterLossKw
  return {
    engineMechanicalPowerKw,
    mg1MechanicalPowerKw,
    mg1ElectricalPowerKw: mg1.electricalPowerKw,
    mg2MechanicalPowerKw,
    mg2ElectricalPowerKw: mg2.electricalPowerKw,
    mg1TorqueNm,
    mg2TorqueNm,
    motorLossKw: mg1.motorLossKw + mg2.motorLossKw,
    inverterLossKw,
    inverterThroughputKw,
    batteryTerminalPowerKw,
    drivetrainLossKw,
    enginePumpingLossKw,
    accessoryPowerKw: context.accessoryPowerKw,
    protectedReservePowerKw,
    mechanicalResidualKw,
    electricalResidualKw,
  }
}

function feasibilityViolations(allocation: Allocation, engineTorqueNm: number, engineRpm: number, limits: FeasibilityLimits) {
  const factor = limits.componentSafetyFactor
  return {
    engineTorqueViolationNm: Math.max(0, Math.abs(engineTorqueNm) - engineTorqueLimitNm(engineRpm) * factor),
    enginePowerViolationKw: Math.max(0, Math.abs(allocation.engineMechanicalPowerKw) - LIMITS.enginePowerKw * factor),
    mg1TorqueViolationNm: Math.max(0, Math.abs(allocation.mg1TorqueNm) - LIMITS.mg1TorqueNm * factor),
    mg1PowerViolationKw: Math.max(0, Math.abs(allocation.mg1MechanicalPowerKw) - LIMITS.mg1PowerKw * factor),
    mg2TorqueViolationNm: Math.max(0, Math.abs(allocation.mg2TorqueNm) - LIMITS.mg2TorqueNm * factor),
    mg2PowerViolationKw: Math.max(0, Math.abs(allocation.mg2MechanicalPowerKw) - LIMITS.mg2PowerKw * factor),
    batteryDischargeViolationKw: Math.max(0, allocation.batteryTerminalPowerKw - limits.dischargeLimitKw),
    batteryChargeViolationKw: Math.max(0, -allocation.batteryTerminalPowerKw - limits.chargeLimitKw),
    inverterThroughputViolationKw: Math.max(0, allocation.inverterThroughputKw - limits.inverterLimitKw),
  }
}

function allocationIsFeasible(allocation: Allocation, engineTorqueNm: number, engineRpm: number, limits: FeasibilityLimits) {
  const violations = feasibilityViolations(allocation, engineTorqueNm, engineRpm, limits)
  return Object.values(violations).every((violation) => violation <= 1e-7)
}

function chooseEngineTorque(
  state: SimulationState,
  inputs: DriverInputs,
  context: Omit<AllocationContext, 'engineTorqueNm'>,
  targetBatteryPowerKw: number,
  limits: FeasibilityLimits,
  combustionAllowed: boolean,
) {
  if (state.engineState !== 'FUELED' || inputs.selector === 'N' || !combustionAllowed) return 0
  const maximum = engineTorqueLimitNm(context.engineRpm) * 0.995
  if (maximum <= 0) return 0
  let bestTorque = 0
  let bestError = Number.POSITIVE_INFINITY
  for (let index = 0; index <= 80; index += 1) {
    const torque = maximum * index / 80
    const allocation = allocatePower({ ...context, engineTorqueNm: torque })
    const violations = feasibilityViolations(allocation, torque, context.engineRpm, limits)
    // Wheel demand is scaled after engine selection. At this stage only reject
    // candidates the engine/MG1 pair itself cannot physically support.
    if (violations.engineTorqueViolationNm > 1e-7
      || violations.enginePowerViolationKw > 1e-7
      || violations.mg1TorqueViolationNm > 1e-7
      || violations.mg1PowerViolationKw > 1e-7) continue
    const error = Math.abs(allocation.batteryTerminalPowerKw - targetBatteryPowerKw)
    if (error < bestError) {
      bestError = error
      bestTorque = torque
    }
  }
  return bestTorque
}

function updateEngineState(
  state: SimulationState,
  fuelRequired: boolean,
  spinRequired: boolean,
  minimumRunPermitted: boolean,
  dt: number,
) {
  let engineState = state.engineState
  let crankingTimerSeconds = state.crankingTimerSeconds
  let crankingWorkKj = state.crankingWorkKj
  let crankingDeliveredPowerKw = state.crankingDeliveredPowerKw
  let engineOnTimerSeconds = state.engineOnTimerSeconds
  let engineOffTimerSeconds = state.engineOffTimerSeconds
  let stoppingTimerSeconds = state.stoppingTimerSeconds
  const canRelight = Math.abs(state.engineRpm) >= CONTROL.engineRelightRpm

  if (engineState === 'OFF') {
    engineOffTimerSeconds += dt
    if (fuelRequired && engineOffTimerSeconds >= CONTROL.minimumEngineOffSeconds) {
      engineState = 'CRANKING'
      crankingTimerSeconds = 0
      crankingWorkKj = 0
      crankingDeliveredPowerKw = 0
      engineOffTimerSeconds = 0
    } else if (spinRequired) {
      engineState = 'SPINNING_UNFUELED'
      engineOffTimerSeconds = 0
    }
  } else if (engineState === 'CRANKING') {
    crankingTimerSeconds += dt
    // Integrate only the feasible mechanical power that the preceding solved
    // step actually delivered. A depleted source therefore contributes no
    // work, while a lower-power but physically valid crank simply takes longer.
    crankingWorkKj += Math.max(0, crankingDeliveredPowerKw) * dt
    const crankComplete = crankingTimerSeconds >= CONTROL.engineCrankSeconds
      && crankingWorkKj >= CONTROL.engineCrankRequiredWorkKj
    if (crankComplete || (!fuelRequired && crankingTimerSeconds >= CONTROL.engineCrankSeconds)) {
      engineState = crankComplete && fuelRequired ? 'FUELED' : 'STOPPING'
      engineOnTimerSeconds = 0
      crankingTimerSeconds = 0
      crankingWorkKj = 0
      crankingDeliveredPowerKw = 0
      stoppingTimerSeconds = 0
    }
  } else if (engineState === 'FUELED') {
    engineOnTimerSeconds += dt
    if (!fuelRequired && (!minimumRunPermitted || engineOnTimerSeconds >= CONTROL.minimumEngineOnSeconds)) {
      engineState = spinRequired ? 'SPINNING_UNFUELED' : 'STOPPING'
      stoppingTimerSeconds = 0
    }
  } else if (engineState === 'SPINNING_UNFUELED') {
    if (fuelRequired && canRelight) {
      engineState = 'FUELED'
      engineOnTimerSeconds = 0
      crankingTimerSeconds = 0
      crankingWorkKj = 0
      crankingDeliveredPowerKw = 0
    } else if (fuelRequired) {
      engineState = 'CRANKING'
      crankingTimerSeconds = 0
      crankingWorkKj = 0
      crankingDeliveredPowerKw = 0
    } else if (!spinRequired) {
      engineState = 'STOPPING'
      stoppingTimerSeconds = 0
    }
  } else {
    stoppingTimerSeconds += dt
    if (fuelRequired && canRelight) {
      engineState = 'FUELED'
      engineOnTimerSeconds = 0
      stoppingTimerSeconds = 0
      crankingWorkKj = 0
      crankingDeliveredPowerKw = 0
    } else if (fuelRequired) {
      engineState = 'CRANKING'
      crankingTimerSeconds = 0
      crankingWorkKj = 0
      crankingDeliveredPowerKw = 0
      stoppingTimerSeconds = 0
    } else if (spinRequired) {
      engineState = 'SPINNING_UNFUELED'
      stoppingTimerSeconds = 0
    } else if (stoppingTimerSeconds >= CONTROL.engineStopSeconds) {
      engineState = 'OFF'
      engineOffTimerSeconds = 0
      stoppingTimerSeconds = 0
      engineOnTimerSeconds = 0
    }
  }
  return {
    engineState,
    crankingTimerSeconds,
    crankingWorkKj,
    crankingDeliveredPowerKw,
    engineOnTimerSeconds,
    engineOffTimerSeconds,
    stoppingTimerSeconds,
  }
}

function desiredEngineRpm(
  engineState: EngineState,
  inputs: DriverInputs,
  propulsionPowerKw: number,
  chargeRequest: boolean,
  speedKph: number,
) {
  if (engineState === 'OFF') return 0
  if (engineState === 'CRANKING') return 1_100
  if (engineState === 'STOPPING') return 0
  if (engineState === 'SPINNING_UNFUELED') return clamp(1_100 + speedKph * 18, 1_100, 3_800)
  if (inputs.selector === 'N') return 1_050
  if (inputs.selector === 'P') return chargeRequest ? 1_550 : 1_250
  if (inputs.accelerator > 0.82) return 2_500 + inputs.accelerator * 2_100
  if (chargeRequest) return clamp(1_900 + propulsionPowerKw * 23, 1_800, 3_400)
  return clamp(1_350 + propulsionPowerKw * 38, 1_300, 3_500)
}

function stabilizeClassification<T extends string>(
  current: T,
  candidate: T,
  currentTimer: number,
  pending: T,
  pendingTimer: number,
  dt: number,
  immediate = false,
) {
  if (candidate === current) {
    return { value: current, timer: currentTimer + dt, pending: current, pendingTimer: 0 }
  }
  const nextPendingTimer = candidate === pending ? pendingTimer + dt : dt
  if (immediate || nextPendingTimer >= CONTROL.classificationMinimumSeconds) {
    return { value: candidate, timer: 0, pending: candidate, pendingTimer: 0 }
  }
  return { value: current, timer: currentTimer + dt, pending: candidate, pendingTimer: nextPendingTimer }
}

function classifyMotion(
  inputs: DriverInputs,
  speedMps: number,
  accelerationMps2: number,
  movingBraking: boolean,
): VehicleMotionState {
  if (Math.abs(speedMps) < 0.15 && Math.abs(accelerationMps2) < 0.15) return 'STATIONARY'
  if (speedMps < -0.15) return 'REVERSING'
  if (movingBraking || (speedMps > 0.15 && accelerationMps2 < -0.18 && inputs.brake > 0.001)) return 'BRAKING'
  if (inputs.accelerator > 0.01 && accelerationMps2 > 0.08) return 'ACCELERATING'
  if (inputs.accelerator < 0.01 && inputs.brake < 0.01) return 'COASTING'
  return 'CRUISING'
}

function classifyObjective(
  engineState: EngineState,
  warmupRequest: boolean,
  chargeRequest: boolean,
  propulsionNeedsEngine: boolean,
  assisting: boolean,
  evPropulsion: boolean,
  regenerating: boolean,
  engineBraking: boolean,
  mg1Protection: boolean,
): SystemObjective {
  if (engineState === 'CRANKING') return 'STARTING'
  if (mg1Protection) return 'MG1_PROTECTION'
  if (engineBraking) return 'ENGINE_BRAKING'
  if (engineState === 'FUELED' && warmupRequest) return 'WARM_UP'
  if (engineState === 'FUELED' && chargeRequest) return 'CHARGING'
  if (engineState === 'FUELED' && assisting) return 'ASSISTING'
  if (engineState === 'FUELED' && propulsionNeedsEngine) return 'PROPULSION'
  if (regenerating) return 'REGENERATING'
  if (evPropulsion) return 'EV_PROPULSION'
  if (engineState === 'FUELED') return 'IDLING'
  return 'ENGINE_OFF'
}

function createEnergyFlows(
  allocation: Allocation,
  drivetrainWheelPowerKw: number,
  regenKw: number,
  frictionKw: number,
  engineBrakeKw: number,
  engineState: EngineState,
) {
  const flows: EnergyFlow[] = []
  const add = (id: EnergyFlow['id'], kind: EnergyFlow['kind'], powerKw: number, direction: 1 | -1 = 1) => {
    if (Math.abs(powerKw) > 0.12) flows.push({ id, kind, powerKw: Math.abs(powerKw), direction })
  }
  if (allocation.engineMechanicalPowerKw > 0.1) add('engine-planetary', 'engine', allocation.engineMechanicalPowerKw)
  const planetaryOutput = allocation.engineMechanicalPowerKw + allocation.mg1MechanicalPowerKw
  if (planetaryOutput > 0.1) add('planetary-output', 'engine', planetaryOutput)
  if (drivetrainWheelPowerKw > 0.1) add('output-wheels', allocation.engineMechanicalPowerKw > 0 ? 'engine' : 'mg2', drivetrainWheelPowerKw)
  if (allocation.batteryTerminalPowerKw > 0.12) add('battery-inverter', 'battery', allocation.batteryTerminalPowerKw)
  if (allocation.mg1ElectricalPowerKw < -0.12) add('mg1-inverter', 'mg1', -allocation.mg1ElectricalPowerKw)
  if (allocation.mg1ElectricalPowerKw > 0.12) add('inverter-mg1', 'battery', allocation.mg1ElectricalPowerKw)
  if (allocation.mg2ElectricalPowerKw > 0.12) {
    if (allocation.mg1ElectricalPowerKw < -0.12) add('inverter-mg2', 'mg1', Math.min(allocation.mg2ElectricalPowerKw, -allocation.mg1ElectricalPowerKw))
    if (allocation.batteryTerminalPowerKw > 0.12) add('inverter-mg2', 'battery', Math.min(allocation.mg2ElectricalPowerKw, allocation.batteryTerminalPowerKw))
  }
  if (regenKw > 0.12) {
    add('wheels-mg2', 'regen', regenKw)
    add('inverter-mg2', 'regen', -allocation.mg2ElectricalPowerKw, -1)
  }
  if (allocation.batteryTerminalPowerKw < -0.12) add('inverter-battery', 'regen', -allocation.batteryTerminalPowerKw)
  if (engineState === 'CRANKING') add('mg1-engine', 'battery', allocation.mg1MechanicalPowerKw)
  if (engineBrakeKw > 0.12) add('drivetrain-engine', 'loss', engineBrakeKw, -1)
  if (frictionKw > 0.12) add('friction-brakes', 'loss', frictionKw)
  return flows
}

function advanceSubstep(previous: SimulationState, rawInputs: DriverInputs, dt: number): SimulationStepResult {
  const inputs = sanitizeInputs(rawInputs)
  const speed = clamp(previous.vehicleSpeedMps, -maxVehicleSpeedMps, maxVehicleSpeedMps)
  const absSpeed = Math.abs(speed)
  const speedKph = absSpeed * 3.6
  const direction = Math.sign(speed)
  const preKinematics = calculateKinematics(speed, previous.engineRpm)
  const ringRpm = preKinematics.ringRpm

  let chargeRequestActive = previous.chargeRequestActive
  if (!chargeRequestActive && previous.batterySoc <= BATTERY.chargeRequestSoc) chargeRequestActive = true
  if (chargeRequestActive && previous.batterySoc >= BATTERY.chargeClearSoc) chargeRequestActive = false
  let warmupRequestActive = previous.warmupRequestActive
  if (!warmupRequestActive && previous.engineTemperatureC <= CONTROL.warmupStartC) warmupRequestActive = true
  if (warmupRequestActive && previous.engineTemperatureC >= CONTROL.warmupClearC) warmupRequestActive = false

  const selectorDirection = inputs.selector === 'R' ? -1 : inputs.selector === 'D' || inputs.selector === 'B' ? 1 : 0
  const reverseSpeedLimited = inputs.selector === 'R' && speed < -35 / 3.6
  const forwardSpeedLimited = selectorDirection > 0 && speed >= maxVehicleSpeedMps - 0.02
  const requestedDriveForceMagnitude = selectorDirection === 0 || reverseSpeedLimited || forwardSpeedLimited
    ? 0
    : VEHICLE.maxTireForceN * Math.pow(inputs.accelerator, 1.35) * (inputs.selector === 'R' ? 0.62 : 1)
  const requestedDriveForceN = requestedDriveForceMagnitude * selectorDirection
  // Wheel power must retain T·ω sign. Applying D torque while rolling backward
  // (or R torque while rolling forward) initially absorbs vehicle energy.
  const unconstrainedPropulsionPowerKw = requestedDriveForceN * speed / 1_000
  const pedalPowerLimitKw = inputs.accelerator > 0 ? Math.max(8, inputs.accelerator * LIMITS.systemPowerKw) : 0
  const propulsionPowerLimitKw = Math.min(pedalPowerLimitKw, LIMITS.systemPowerKw)
  const propulsionPowerKw = clamp(unconstrainedPropulsionPowerKw, -propulsionPowerLimitKw, propulsionPowerLimitKw)
  const propulsionNeedsEngine = propulsionPowerKw > 0
    && (inputs.accelerator > 0.57 || propulsionPowerKw > 30)
  const brakeHoldActive = inputs.brake > 0.01 && absSpeed <= 0.35
  const movingBraking = (inputs.brake > 0.01 && absSpeed > 0.35)
    || (inputs.selector === 'B' && absSpeed > 1 && inputs.accelerator < 0.01)
  const fuelRequired = inputs.selector !== 'N' && !movingBraking && (
    chargeRequestActive || warmupRequestActive || propulsionNeedsEngine
  )
  const mg1ProtectionRequired = carrierRangeForMg1(ringRpm).minimumRpm > 1
  const spinRequired = (inputs.selector === 'B' && absSpeed > 2 && inputs.accelerator < 0.03) || mg1ProtectionRequired
  const minimumRunPermitted = inputs.selector !== 'N' && !movingBraking
  const engineTransition = updateEngineState(previous, fuelRequired, spinRequired, minimumRunPermitted, dt)

  const dischargeLimitKw = terminalDischargeLimitKw(previous, dt)
  const chargeLimitKw = terminalChargeLimitKw(previous, dt)
  const reserveLimitKw = protectedReserveLimitKw(previous, dt)
  const reserveRechargeLimitKw = protectedReserveRechargeLimitKw(previous, dt)
  const accessoryPowerKw = BATTERY.accessoryLoadKw
  const crankAvailableElectricalKw = Math.max(0, dischargeLimitKw + reserveLimitKw - accessoryPowerKw)
  const crankCapability = clamp(
    crankAvailableElectricalKw * DRIVETRAIN.inverterEfficiency * DRIVETRAIN.motorEfficiency
      / CONTROL.engineCrankMinimumPowerKw,
    0,
    1,
  )
  const desiredRpm = desiredEngineRpm(engineTransition.engineState, inputs, propulsionPowerKw, chargeRequestActive, speedKph)
  const rpmTarget = engineTransition.engineState === 'CRANKING' ? desiredRpm * crankCapability : desiredRpm
  const unconstrainedEngineRpm = approach(previous.engineRpm, rpmTarget, CONTROL.engineRpmRatePerSecond * dt)
  const resolvedEngine = resolveCarrierRpm(ringRpm, unconstrainedEngineRpm)
  const engineRpm = engineTransition.engineState === 'OFF' && !mg1ProtectionRequired ? 0 : resolvedEngine.carrierRpm
  const mg1Rpm = resolvedEngine.mg1Rpm
  const mg2Rpm = -ringRpm * DRIVETRAIN.mg2ReductionRatio

  const controlLimits: FeasibilityLimits = {
    dischargeLimitKw: dischargeLimitKw * 0.995,
    chargeLimitKw: chargeLimitKw * 0.995,
    inverterLimitKw: LIMITS.inverterThroughputKw * 0.995,
    componentSafetyFactor: 0.98,
  }
  const reportingLimits: FeasibilityLimits = {
    dischargeLimitKw,
    chargeLimitKw,
    inverterLimitKw: LIMITS.inverterThroughputKw,
    componentSafetyFactor: 1,
  }
  const gradeRadians = Math.atan(inputs.roadGradePercent / 100)
  const aerodynamicForceN = 0.5 * VEHICLE.airDensityKgM3 * VEHICLE.dragCoefficient * VEHICLE.frontalAreaM2 * speed * absSpeed
  const rollingForceN = absSpeed > 0.02
    ? VEHICLE.rollingResistanceCoefficient * VEHICLE.massKg * VEHICLE.gravityMps2 * direction
    : 0
  const gradeForceN = VEHICLE.massKg * VEHICLE.gravityMps2 * Math.sin(gradeRadians)
  const requestedBrakeForceN = VEHICLE.maxBrakeForceN * inputs.brake
  const bModeBrakePowerKw = inputs.selector === 'B' && inputs.accelerator < 0.01 && absSpeed > 1
    ? Math.min(20, 1.5 + speedKph * 0.18)
    : 0
  const requestedBrakePowerKw = requestedBrakeForceN * absSpeed / 1_000 + bModeBrakePowerKw
  const speedRegenFactor = clamp((speedKph - 3) / 12, 0, 1)
  const socRegenFactor = previous.batterySoc < BATTERY.regenTaperSoc
    ? 1
    : clamp((BATTERY.hardUpperSoc - previous.batterySoc) / (BATTERY.hardUpperSoc - BATTERY.regenTaperSoc), 0, 1)
  const engineBrakePowerKw = spinRequired && movingBraking
    ? Math.min(requestedBrakePowerKw, bModeBrakePowerKw > 0 ? Math.max(3, bModeBrakePowerKw * 0.45) : 2.5)
    : 0
  const brakeAfterEngineKw = Math.max(0, requestedBrakePowerKw - engineBrakePowerKw)
  const regenWheelPowerKw = Math.min(
    brakeAfterEngineKw,
    LIMITS.regenPowerKw * speedRegenFactor * socRegenFactor,
    Math.max(0, chargeLimitKw + accessoryPowerKw) / Math.max(DRIVETRAIN.motorEfficiency * DRIVETRAIN.inverterEfficiency, 0.01),
  )
  let frictionBrakePowerKw = Math.max(0, requestedBrakePowerKw - engineBrakePowerKw - regenWheelPowerKw)
  let drivetrainWheelPowerKw = movingBraking ? -(regenWheelPowerKw + engineBrakePowerKw) : propulsionPowerKw
  let enginePumpingLossKw = engineBrakePowerKw
  const crankSourceElectricalPowerKw = Math.max(0, dischargeLimitKw + reserveLimitKw - accessoryPowerKw)
  const mg1CrankingPowerKw = engineTransition.engineState === 'CRANKING'
    ? Math.min(
      5.5,
      Math.abs(mg1Rpm) * TWO_PI / 60 * LIMITS.mg1TorqueNm * 0.86 / 1_000,
      crankSourceElectricalPowerKw * DRIVETRAIN.inverterEfficiency * DRIVETRAIN.motorEfficiency,
    )
    : 0
  if (engineTransition.engineState === 'SPINNING_UNFUELED' && mg1ProtectionRequired && !movingBraking) enginePumpingLossKw += 1.2

  const wheelTorqueRequestNm = requestedDriveForceN * VEHICLE.wheelRadiusM
  // Fixed-carrier reduction reverses torque and speed between the MG2 sun and output ring.
  const requestedMg2TorqueNm = -wheelTorqueRequestNm
    / (DRIVETRAIN.finalDriveRatio * DRIVETRAIN.mg2ReductionRatio * DRIVETRAIN.mechanicalEfficiency)
  const baseContext = {
    engineRpm,
    mg1Rpm,
    mg2Rpm,
    drivetrainWheelPowerKw,
    enginePumpingLossKw,
    requestedMg2TorqueNm,
    accessoryPowerKw,
    mg1CrankingPowerKw,
    protectedReserveAvailablePowerKw: reserveLimitKw,
    protectedReserveRechargeLimitKw: reserveRechargeLimitKw,
    usableBatteryDischargeLimitKw: dischargeLimitKw,
  }
  const chargeTaper = clamp(
    (BATTERY.chargeClearSoc - previous.batterySoc) / (BATTERY.chargeClearSoc - BATTERY.preferredTargetSoc),
    0.45,
    1,
  )
  const chargingHeadroom = clamp(1 - Math.max(0, inputs.accelerator - 0.25) / 0.65, 0, 1)
  const targetBatteryPowerKw = chargeRequestActive
    ? -12 * chargeTaper * chargingHeadroom
    : inputs.accelerator > 0.65
      ? 22 * clamp((inputs.accelerator - 0.65) / 0.35, 0, 1)
      : 0
  const minimumRunActive = engineTransition.engineState === 'FUELED'
    && !fuelRequired
    && minimumRunPermitted
    && engineTransition.engineOnTimerSeconds < CONTROL.minimumEngineOnSeconds
  const combustionAllowed = engineTransition.engineState === 'FUELED'
    && (fuelRequired || minimumRunActive)
    && !movingBraking
  const optimizedEngineTorqueNm = chooseEngineTorque(
    { ...previous, engineState: engineTransition.engineState, engineRpm, chargeRequestActive },
    inputs,
    baseContext,
    targetBatteryPowerKw,
    controlLimits,
    combustionAllowed,
  )
  const targetEngineTorqueNm = minimumRunActive
    ? Math.max(optimizedEngineTorqueNm, Math.min(12, engineTorqueLimitNm(engineRpm) * 0.5))
    : optimizedEngineTorqueNm
  const engineTorqueNm = combustionAllowed
    ? approach(previous.engineTorqueNm, targetEngineTorqueNm, CONTROL.engineTorqueRatePerSecond * dt)
    : 0

  let allocation = allocatePower({ ...baseContext, engineTorqueNm })
  let driveScale = 1
  const propulsionFeasible = (scale: number) => {
    const candidate = allocatePower({
      ...baseContext,
      drivetrainWheelPowerKw: propulsionPowerKw * scale,
      requestedMg2TorqueNm: requestedMg2TorqueNm * scale,
      engineTorqueNm,
    })
    return {
      candidate,
      feasible: allocationIsFeasible(candidate, engineTorqueNm, engineRpm, controlLimits),
    }
  }
  if (!movingBraking && requestedDriveForceMagnitude > 0 && !propulsionFeasible(1).feasible) {
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (low + high) / 2
      if (propulsionFeasible(middle).feasible) low = middle
      else high = middle
    }
    driveScale = low
    drivetrainWheelPowerKw = propulsionPowerKw * driveScale
    allocation = allocatePower({
      ...baseContext,
      drivetrainWheelPowerKw,
      requestedMg2TorqueNm: requestedMg2TorqueNm * driveScale,
      engineTorqueNm,
    })
  }

  if (!movingBraking && !allocationIsFeasible(allocation, engineTorqueNm, engineRpm, controlLimits) && engineTorqueNm > 0) {
    let bestAllocation = allocatePower({ ...baseContext, drivetrainWheelPowerKw, engineTorqueNm: 0 })
    let bestTorque = 0
    for (let index = 1; index <= 80; index += 1) {
      const candidateTorque = engineTorqueNm * index / 80
      const candidate = allocatePower({ ...baseContext, drivetrainWheelPowerKw, engineTorqueNm: candidateTorque })
      if (allocationIsFeasible(candidate, candidateTorque, engineRpm, controlLimits)) {
        bestTorque = candidateTorque
        bestAllocation = candidate
      }
    }
    allocation = bestAllocation
    // The state records the actually feasible combustion torque, not the original ramp target.
    if (bestTorque < engineTorqueNm - 1e-9) {
      allocation = allocatePower({ ...baseContext, drivetrainWheelPowerKw, engineTorqueNm: bestTorque })
    }
  }

  // Keep the state torque exactly aligned with the final feasible allocation.
  let feasibleEngineTorqueNm = allocation.engineMechanicalPowerKw === 0 || Math.abs(engineRpm) < EPSILON
    ? (combustionAllowed ? engineTorqueNm : 0)
    : allocation.engineMechanicalPowerKw * 1_000 / (engineRpm * TWO_PI / 60)

  let actualRegenWheelPowerKw = regenWheelPowerKw
  if (movingBraking && !allocationIsFeasible(allocation, feasibleEngineTorqueNm, engineRpm, controlLimits) && regenWheelPowerKw > 0) {
    let low = 0
    let high = regenWheelPowerKw
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (low + high) / 2
      const candidateWheelPower = -(middle + engineBrakePowerKw)
      const candidate = allocatePower({ ...baseContext, drivetrainWheelPowerKw: candidateWheelPower, engineTorqueNm: feasibleEngineTorqueNm })
      if (allocationIsFeasible(candidate, feasibleEngineTorqueNm, engineRpm, controlLimits)) low = middle
      else high = middle
    }
    actualRegenWheelPowerKw = low
    frictionBrakePowerKw += regenWheelPowerKw - actualRegenWheelPowerKw
    drivetrainWheelPowerKw = -(actualRegenWheelPowerKw + engineBrakePowerKw)
  }

  const effectiveDriveForceN = movingBraking
    ? 0
    : absSpeed > 0.25
      ? selectorDirection * Math.abs(drivetrainWheelPowerKw) * 1_000 / absSpeed
      : requestedDriveForceN * driveScale
  const regenBrakeForceN = absSpeed > 0.25 ? actualRegenWheelPowerKw * 1_000 / absSpeed : 0
  const engineBrakeForceN = absSpeed > 0.25 ? engineBrakePowerKw * 1_000 / absSpeed : 0
  const frictionBrakeForceN = absSpeed > 0.25
    ? frictionBrakePowerKw * 1_000 / absSpeed
    : requestedBrakeForceN
  const totalBrakeForceN = regenBrakeForceN + engineBrakeForceN + frictionBrakeForceN
  const brakeDirection = direction !== 0 ? direction : selectorDirection
  let netForceN = effectiveDriveForceN - aerodynamicForceN - rollingForceN - gradeForceN - totalBrakeForceN * brakeDirection
  const parkLockEngaged = inputs.selector === 'P' && absSpeed < 0.5
  if (parkLockEngaged || brakeHoldActive) netForceN = 0
  const accelerationMps2 = netForceN / VEHICLE.massKg
  let newSpeed = parkLockEngaged || brakeHoldActive
    ? 0
    : clamp(speed + accelerationMps2 * dt, -maxVehicleSpeedMps, maxVehicleSpeedMps)
  if (movingBraking && speed !== 0 && Math.sign(newSpeed) !== Math.sign(speed)) newSpeed = 0
  const newPosition = previous.vehiclePositionM + (speed + newSpeed) * 0.5 * dt

  const postKinematics = calculateKinematics(newSpeed, engineRpm)
  let postContext: AllocationContext = {
    ...baseContext,
    engineTorqueNm: feasibleEngineTorqueNm,
    engineRpm: postKinematics.carrierRpm,
    mg1Rpm: postKinematics.mg1Rpm,
    mg2Rpm: postKinematics.mg2Rpm,
    drivetrainWheelPowerKw,
    requestedMg2TorqueNm: requestedMg2TorqueNm * driveScale,
  }
  allocation = allocatePower(postContext)

  // Final feasibility is evaluated at the same post-step RPMs reported to the
  // dashboard. If the speed update tightened a limit, trim the commanded port
  // power here rather than reporting an impossible instantaneous state.
  if (!allocationIsFeasible(allocation, feasibleEngineTorqueNm, postKinematics.carrierRpm, controlLimits)) {
    if (!movingBraking) {
      let low = 0
      let high = driveScale
      for (let iteration = 0; iteration < 32; iteration += 1) {
        const middle = (low + high) / 2
        const candidateContext: AllocationContext = {
          ...postContext,
          drivetrainWheelPowerKw: propulsionPowerKw * middle,
          requestedMg2TorqueNm: requestedMg2TorqueNm * middle,
        }
        const candidate = allocatePower(candidateContext)
        if (allocationIsFeasible(candidate, feasibleEngineTorqueNm, postKinematics.carrierRpm, controlLimits)) low = middle
        else high = middle
      }
      driveScale = low
      drivetrainWheelPowerKw = propulsionPowerKw * driveScale
      postContext = {
        ...postContext,
        drivetrainWheelPowerKw,
        requestedMg2TorqueNm: requestedMg2TorqueNm * driveScale,
      }
      allocation = allocatePower(postContext)
    } else if (actualRegenWheelPowerKw > 0) {
      let low = 0
      let high = actualRegenWheelPowerKw
      for (let iteration = 0; iteration < 32; iteration += 1) {
        const middle = (low + high) / 2
        const candidateWheelPower = -(middle + engineBrakePowerKw)
        const candidate = allocatePower({ ...postContext, drivetrainWheelPowerKw: candidateWheelPower })
        if (allocationIsFeasible(candidate, feasibleEngineTorqueNm, postKinematics.carrierRpm, controlLimits)) low = middle
        else high = middle
      }
      frictionBrakePowerKw += actualRegenWheelPowerKw - low
      actualRegenWheelPowerKw = low
      drivetrainWheelPowerKw = -(actualRegenWheelPowerKw + engineBrakePowerKw)
      postContext = { ...postContext, drivetrainWheelPowerKw }
      allocation = allocatePower(postContext)
    }
  }

  if (!allocationIsFeasible(allocation, feasibleEngineTorqueNm, postKinematics.carrierRpm, controlLimits)
    && feasibleEngineTorqueNm > 0) {
    let bestTorque = 0
    let bestAllocation = allocatePower({ ...postContext, engineTorqueNm: 0 })
    for (let index = 1; index <= 80; index += 1) {
      const candidateTorque = feasibleEngineTorqueNm * index / 80
      const candidate = allocatePower({ ...postContext, engineTorqueNm: candidateTorque })
      if (allocationIsFeasible(candidate, candidateTorque, postKinematics.carrierRpm, controlLimits)) {
        bestTorque = candidateTorque
        bestAllocation = candidate
      }
    }
    feasibleEngineTorqueNm = bestTorque
    allocation = bestAllocation
  }
  feasibleEngineTorqueNm = engineTransition.engineState === 'FUELED' ? feasibleEngineTorqueNm : 0
  const feasibleCrankingPowerKw = engineTransition.engineState === 'CRANKING'
    ? Math.max(0, allocation.mg1MechanicalPowerKw)
    : 0

  const preBatteryInternalPowerKw = allocation.batteryTerminalPowerKw >= 0
    ? allocation.batteryTerminalPowerKw / BATTERY.dischargeEfficiency
    : allocation.batteryTerminalPowerKw * BATTERY.chargeEfficiency
  const batteryInternalPowerKw = Math.abs(allocation.batteryTerminalPowerKw) < EPSILON ? 0 : preBatteryInternalPowerKw
  const minimumBatteryEnergyKwh = BATTERY.nominalCapacityKwh * BATTERY.hardLowerSoc / 100
  const maximumBatteryEnergyKwh = BATTERY.nominalCapacityKwh * BATTERY.hardUpperSoc / 100
  const newBatteryEnergyKwh = clamp(
    previous.batteryEnergyKwh - batteryInternalPowerKw * dt / 3_600,
    minimumBatteryEnergyKwh,
    maximumBatteryEnergyKwh,
  )
  const newBatterySoc = newBatteryEnergyKwh / BATTERY.nominalCapacityKwh * 100
  const newProtectedReserveEnergyKwh = clamp(
    previous.protectedReserveEnergyKwh - allocation.protectedReservePowerKw * dt / 3_600,
    0,
    BATTERY.protectedReserveCapacityKwh,
  )

  const heatRate = engineTransition.engineState === 'FUELED'
    ? 0.055 + allocation.engineMechanicalPowerKw * 0.0016
    : -0.009 * clamp((previous.engineTemperatureC - CONTROL.ambientTemperatureC) / 60, 0, 1)
  const engineTemperatureC = clamp(previous.engineTemperatureC + heatRate * dt, CONTROL.ambientTemperatureC, 105)
  const actualAccelerationMps2 = dt > 0 ? (newSpeed - speed) / dt : previous.vehicleAccelerationMps2
  const motionCandidate = classifyMotion(inputs, newSpeed, actualAccelerationMps2, movingBraking)
  const oppositeDirectionRegenerationKw = movingBraking ? 0 : Math.max(0, -drivetrainWheelPowerKw)
  const recoveredWheelPowerKw = actualRegenWheelPowerKw + oppositeDirectionRegenerationKw
  const assisting = engineTransition.engineState === 'FUELED'
    && inputs.accelerator > 0.65
    && allocation.batteryTerminalPowerKw > 1
  const evPropulsion = engineTransition.engineState !== 'FUELED'
    && drivetrainWheelPowerKw > 0.2
    && allocation.mg2MechanicalPowerKw > 0.1
  const regenerating = recoveredWheelPowerKw > 0.12
    && allocation.batteryTerminalPowerKw < -0.12
  const objectiveCandidate = classifyObjective(
    engineTransition.engineState,
    warmupRequestActive,
    chargeRequestActive,
    propulsionNeedsEngine,
    assisting,
    evPropulsion,
    regenerating,
    engineBrakePowerKw > 0.2,
    mg1ProtectionRequired,
  )
  const motion = stabilizeClassification(
    previous.vehicleMotionState,
    motionCandidate,
    previous.motionStateTimerSeconds,
    previous.pendingVehicleMotionState,
    previous.pendingMotionStateTimerSeconds,
    dt,
  )
  const objective = stabilizeClassification(
    previous.systemObjective,
    objectiveCandidate,
    previous.systemObjectiveTimerSeconds,
    previous.pendingSystemObjective,
    previous.pendingSystemObjectiveTimerSeconds,
    dt,
    objectiveCandidate === 'STARTING'
      || objectiveCandidate === 'MG1_PROTECTION'
      || (engineTransition.engineState === 'FUELED' && previous.systemObjective === 'ENGINE_OFF'),
  )

  const updatedState: SimulationState = {
    ...previous,
    ...engineTransition,
    timeSeconds: previous.timeSeconds + dt,
    vehicleSpeedMps: newSpeed,
    vehiclePositionM: newPosition,
    vehicleAccelerationMps2: actualAccelerationMps2,
    batteryEnergyKwh: newBatteryEnergyKwh,
    batterySoc: newBatterySoc,
    protectedReserveEnergyKwh: newProtectedReserveEnergyKwh,
    crankingDeliveredPowerKw: feasibleCrankingPowerKw,
    engineRpm: postKinematics.carrierRpm,
    engineTorqueNm: feasibleEngineTorqueNm,
    mg1Rpm: postKinematics.mg1Rpm,
    mg1TorqueNm: allocation.mg1TorqueNm,
    mg2Rpm: postKinematics.mg2Rpm,
    mg2TorqueNm: allocation.mg2TorqueNm,
    engineTemperatureC,
    chargeRequestActive,
    warmupRequestActive,
    vehicleMotionState: motion.value,
    systemObjective: objective.value,
    motionStateTimerSeconds: motion.timer,
    systemObjectiveTimerSeconds: objective.timer,
    pendingVehicleMotionState: motion.pending,
    pendingSystemObjective: objective.pending,
    pendingMotionStateTimerSeconds: motion.pendingTimer,
    pendingSystemObjectiveTimerSeconds: objective.pendingTimer,
    parkLockEngaged,
  }

  const aerodynamicLossKw = Math.abs(aerodynamicForceN * newSpeed) / 1_000
  const rollingResistanceLossKw = Math.abs(rollingForceN * newSpeed) / 1_000
  const roadGradePowerKw = gradeForceN * newSpeed / 1_000
  const wheelPowerKw = drivetrainWheelPowerKw - frictionBrakePowerKw
  const wheelDemandPowerKw = movingBraking ? -requestedBrakePowerKw : propulsionPowerKw
  const actualDemandPowerKw = movingBraking
    ? -(actualRegenWheelPowerKw + engineBrakePowerKw + frictionBrakePowerKw)
    : drivetrainWheelPowerKw
  const wheelDemandShortfallKw = Math.max(0, Math.abs(wheelDemandPowerKw) - Math.abs(actualDemandPowerKw))
  const violations = feasibilityViolations(allocation, feasibleEngineTorqueNm, postKinematics.carrierRpm, reportingLimits)
  const diagnostics: PowerDiagnostics = {
    engineMechanicalPowerKw: allocation.engineMechanicalPowerKw,
    mg1MechanicalPowerKw: allocation.mg1MechanicalPowerKw,
    mg1ElectricalPowerKw: allocation.mg1ElectricalPowerKw,
    mg2MechanicalPowerKw: allocation.mg2MechanicalPowerKw,
    mg2ElectricalPowerKw: allocation.mg2ElectricalPowerKw,
    batteryTerminalPowerKw: allocation.batteryTerminalPowerKw,
    batteryInternalPowerKw,
    accessoryPowerKw: allocation.accessoryPowerKw,
    protectedReservePowerKw: allocation.protectedReservePowerKw,
    protectedReserveEnergyKwh: newProtectedReserveEnergyKwh,
    inverterLossKw: allocation.inverterLossKw,
    inverterThroughputKw: allocation.inverterThroughputKw,
    motorLossKw: allocation.motorLossKw,
    drivetrainLossKw: allocation.drivetrainLossKw,
    drivetrainWheelPowerKw,
    wheelPowerKw,
    aerodynamicLossKw,
    rollingResistanceLossKw,
    roadGradePowerKw,
    roadLoadPowerKw: aerodynamicLossKw + rollingResistanceLossKw + roadGradePowerKw,
    regenerativeBrakingKw: recoveredWheelPowerKw,
    frictionBrakeLossKw: frictionBrakePowerKw,
    enginePumpingLossKw: allocation.enginePumpingLossKw,
    totalRequestedBrakingKw: requestedBrakePowerKw,
    electricalBalanceResidualKw: allocation.electricalResidualKw,
    mechanicalBalanceResidualKw: allocation.mechanicalResidualKw,
    powerBalanceResidualKw: Math.max(Math.abs(allocation.electricalResidualKw), Math.abs(allocation.mechanicalResidualKw)),
    planetaryResidualRpmTeeth: planetaryResidual(postKinematics.ringRpm, postKinematics.mg1Rpm, postKinematics.carrierRpm),
    mg2RatioResidualRpm: postKinematics.mg2Rpm + postKinematics.ringRpm * DRIVETRAIN.mg2ReductionRatio,
    mg2ReductionResidualRpmTeeth: MG2_REDUCTION.ringTeeth * postKinematics.ringRpm
      + MG2_REDUCTION.sunTeeth * postKinematics.mg2Rpm,
    wheelDemandPowerKw,
    wheelDemandShortfallKw,
    ...violations,
  }
  const motionCopy = MOTION_COPY[motion.value]
  const objectiveCopy = OBJECTIVE_COPY[objective.value]
  const flows = inputs.selector === 'N'
    ? []
    : createEnergyFlows(
      allocation,
      drivetrainWheelPowerKw,
      recoveredWheelPowerKw,
      frictionBrakePowerKw,
      engineBrakePowerKw,
      engineTransition.engineState,
    )
  const wheelOmega = postKinematics.wheelRpm * TWO_PI / 60
  const telemetryWheelTorqueNm = Math.abs(wheelOmega) > 0.5
    ? wheelPowerKw * 1_000 / wheelOmega
    : (effectiveDriveForceN - totalBrakeForceN * brakeDirection) * VEHICLE.wheelRadiusM
  const telemetry: SimulationTelemetry = {
    ...diagnostics,
    vehicleSpeedKph: newSpeed * 3.6,
    vehicleAccelerationMps2: actualAccelerationMps2,
    vehiclePositionM: newPosition,
    wheelRpm: postKinematics.wheelRpm,
    ringRpm: postKinematics.ringRpm,
    carrierRpm: postKinematics.carrierRpm,
    engineRpm: postKinematics.carrierRpm,
    engineTorqueNm: feasibleEngineTorqueNm,
    mg1Rpm: postKinematics.mg1Rpm,
    mg1TorqueNm: allocation.mg1TorqueNm,
    mg2Rpm: postKinematics.mg2Rpm,
    mg2TorqueNm: allocation.mg2TorqueNm,
    wheelTorqueNm: telemetryWheelTorqueNm,
    batterySoc: newBatterySoc,
    engineTemperatureC,
    chargeRequestActive,
    socTargetPercent: BATTERY.preferredTargetSoc,
    engineState: engineTransition.engineState,
    vehicleMotionState: motion.value,
    systemObjective: objective.value,
    motionLabel: motionCopy.label,
    objectiveLabel: objectiveCopy.label,
    description: `${motionCopy.description} ${objectiveCopy.description}`,
    mg1LimitActive: postKinematics.mg1LimitActive || mg1ProtectionRequired,
    energyFlows: flows,
  }
  return { state: updatedState, telemetry, diagnostics }
}

export function stepSimulation(state: SimulationState, inputs: DriverInputs, deltaSeconds: number): SimulationStepResult {
  const requestedDelta = clamp(deltaSeconds, 0, 10)
  if (requestedDelta <= 0) return advanceSubstep(state, inputs, 0)
  let currentState = state
  let result: SimulationStepResult | undefined
  let remaining = requestedDelta
  while (remaining > EPSILON) {
    const dt = Math.min(CONTROL.fixedSubstepSeconds, remaining)
    result = advanceSubstep(currentState, inputs, dt)
    currentState = result.state
    remaining -= dt
  }
  return result!
}
