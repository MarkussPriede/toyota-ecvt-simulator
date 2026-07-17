import {
  BATTERY,
  CONTROL,
  DRIVETRAIN,
  LIMITS,
  POWER_SPLIT,
  VEHICLE,
  maxVehicleSpeedMps,
} from './constants'
import { carrierRangeForMg1, clamp, planetaryResidual, resolveCarrierRpm } from './planetary'
import type {
  DriverInputs,
  EnergyFlow,
  EngineState,
  OperatingMode,
  PowerDiagnostics,
  SimulationState,
  SimulationStepResult,
  SimulationTelemetry,
} from './types'

const TWO_PI = Math.PI * 2
const EPSILON = 1e-9

export const DEFAULT_DRIVER_INPUTS: DriverInputs = {
  accelerator: 0,
  brake: 0,
  selector: 'P',
  roadGradePercent: 0,
}

const MODE_COPY: Record<OperatingMode, { label: string; description: string }> = {
  READY: { label: 'READY', description: 'The hybrid system is awake; the engine can remain stopped until power, heat, or charge is needed.' },
  PARKED: { label: 'Park lock engaged', description: 'The parking lock holds the output at rest. Low-SOC stationary charging remains available.' },
  EV_DRIVE: { label: 'EV drive', description: 'Battery power passes through the inverter to MG2. Torque exists at zero road speed, so the car can launch.' },
  REVERSE_EV: { label: 'Electric reverse', description: 'MG2 applies reverse torque; no conventional reverse gear is required.' },
  ENGINE_START: { label: 'MG1 starts engine', description: 'The battery motors MG1 for a bounded cranking transient before fuel is enabled.' },
  ENGINE_DRIVE: { label: 'Engine drive', description: 'Planetary member speeds determine the mechanical and electrical power split.' },
  ENGINE_DRIVE_AND_CHARGE: { label: 'Engine drive + charge', description: 'Engine output meets road demand while surplus planetary power drives MG1 and charges the battery.' },
  COMBINED_ACCELERATION: { label: 'Combined acceleration', description: 'Engine mechanical output, MG1-generated electricity, and battery assistance contribute together.' },
  STATIONARY_CHARGING: { label: 'Stationary charging', description: 'With the output stationary, the fueled engine turns the carrier and MG1 generates until the SOC latch clears.' },
  COASTING: { label: 'Glide / coast', description: 'No brake is commanded. Aerodynamic drag and rolling resistance gradually slow the vehicle.' },
  REGENERATIVE_BRAKING: { label: 'Regenerative braking', description: 'Wheel energy drives MG2 as a generator; accepted electrical power returns to the battery.' },
  BLENDED_BRAKING: { label: 'Blended braking', description: 'Regeneration is limited by speed, machine limits, and battery acceptance; friction brakes supply the remainder.' },
  ENGINE_BRAKING: { label: 'B-mode engine braking', description: 'The wheels spin the unfueled engine to add pumping loss while useful regeneration remains active.' },
  NEUTRAL: { label: 'Neutral', description: 'No propulsion, regeneration, or active high-voltage charging is commanded; the planetary members remain connected.' },
}

export interface InitialSimulationOptions {
  vehicleSpeedKph?: number
  vehicleSpeedMps?: number
  batterySoc?: number
  engineTemperatureC?: number
  engineState?: EngineState
  engineRpm?: number
  chargeRequestActive?: boolean
}

export function createInitialSimulationState(options: InitialSimulationOptions = {}): SimulationState {
  const batterySoc = clamp(options.batterySoc ?? 58, BATTERY.hardLowerSoc, BATTERY.hardUpperSoc)
  const vehicleSpeedMps = clamp(
    options.vehicleSpeedMps ?? (options.vehicleSpeedKph ?? 0) / 3.6,
    -maxVehicleSpeedMps,
    maxVehicleSpeedMps,
  )
  const engineState = options.engineState ?? 'OFF'
  const engineRpm = clamp(options.engineRpm ?? (engineState === 'FUELED' ? 1_300 : 0), 0, LIMITS.engineRpm)
  const wheelRpm = speedToWheelRpm(vehicleSpeedMps)
  const ringRpm = wheelRpm * DRIVETRAIN.finalDriveRatio
  const resolved = resolveCarrierRpm(ringRpm, engineRpm)
  return {
    timeSeconds: 0,
    vehicleSpeedMps,
    vehiclePositionM: 0,
    vehicleAccelerationMps2: 0,
    batterySoc,
    batteryEnergyKwh: BATTERY.nominalCapacityKwh * batterySoc / 100,
    engineState,
    engineRpm: resolved.carrierRpm,
    engineTorqueNm: 0,
    mg1Rpm: resolved.mg1Rpm,
    mg1TorqueNm: 0,
    mg2Rpm: ringRpm * DRIVETRAIN.mg2ReductionRatio,
    mg2TorqueNm: 0,
    engineTemperatureC: clamp(options.engineTemperatureC ?? 82, CONTROL.ambientTemperatureC, 110),
    chargeRequestActive: options.chargeRequestActive ?? batterySoc <= BATTERY.chargeRequestSoc,
    warmupRequestActive: (options.engineTemperatureC ?? 82) < CONTROL.warmupStartC,
    operatingMode: 'PARKED',
    crankingTimerSeconds: 0,
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
  const mg2Rpm = ringRpm * DRIVETRAIN.mg2ReductionRatio
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
  const energyHeadroom = Math.max(0, state.batteryEnergyKwh - BATTERY.nominalCapacityKwh * BATTERY.hardLowerSoc / 100)
  const energyLimit = dt > 0 ? energyHeadroom * 3_600 * BATTERY.dischargeEfficiency / dt : BATTERY.maxDischargeKw
  return Math.min(BATTERY.maxDischargeKw * socFactor, energyLimit)
}

function terminalChargeLimitKw(state: SimulationState, dt: number) {
  const socFactor = state.batterySoc < BATTERY.regenTaperSoc
    ? 1
    : clamp((BATTERY.hardUpperSoc - state.batterySoc) / (BATTERY.hardUpperSoc - BATTERY.regenTaperSoc), 0, 1)
  const energyHeadroom = Math.max(0, BATTERY.nominalCapacityKwh * BATTERY.hardUpperSoc / 100 - state.batteryEnergyKwh)
  const energyLimit = dt > 0 ? energyHeadroom * 3_600 / (BATTERY.chargeEfficiency * dt) : BATTERY.maxChargeKw
  return Math.min(BATTERY.maxChargeKw * socFactor, energyLimit)
}

function engineTorqueLimitNm(rpm: number) {
  if (rpm < 650) return 0
  const powerLimited = LIMITS.enginePowerKw * 1_000 / (rpm * TWO_PI / 60)
  const lowSpeedFactor = clamp((rpm - 650) / 600, 0.25, 1)
  return Math.min(LIMITS.engineTorqueNm * lowSpeedFactor, powerLimited)
}

function motorPort(mechanicalPowerKw: number, torqueNm: number) {
  const active = Math.abs(mechanicalPowerKw) > 0.005 || Math.abs(torqueNm) > 0.05
  const torqueLossKw = active ? 0.06 + 0.65 * Math.pow(Math.abs(torqueNm) / Math.max(LIMITS.mg2TorqueNm, 1), 2) : 0
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
  batteryTerminalPowerKw: number
  drivetrainLossKw: number
  accessoryPowerKw: number
  protectedStartReservePowerKw: number
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
  protectedStartReservePowerKw: number
}

function allocatePower(context: AllocationContext): Allocation {
  const engineOmega = context.engineRpm * TWO_PI / 60
  const mg1Omega = context.mg1Rpm * TWO_PI / 60
  const mg2Omega = context.mg2Rpm * TWO_PI / 60
  const engineMechanicalPowerKw = context.engineTorqueNm * engineOmega / 1_000
  const planetaryMg1TorqueNm = -context.engineTorqueNm * POWER_SPLIT.sunTeeth / (POWER_SPLIT.ringTeeth + POWER_SPLIT.sunTeeth)
  const crankTorqueNm = Math.abs(mg1Omega) > 0.5 ? context.mg1CrankingPowerKw * 1_000 / mg1Omega : 48
  const mg1TorqueNm = planetaryMg1TorqueNm + crankTorqueNm
  const mg1MechanicalPowerKw = planetaryMg1TorqueNm * mg1Omega / 1_000 + context.mg1CrankingPowerKw
  const drivetrainLossKw = Math.abs(context.drivetrainWheelPowerKw) * (1 / DRIVETRAIN.mechanicalEfficiency - 1)
    + (Math.abs(context.drivetrainWheelPowerKw) > 0.05 ? 0.08 : 0)
  const mg2MechanicalPowerKw = context.drivetrainWheelPowerKw
    + drivetrainLossKw
    + context.enginePumpingLossKw
    - engineMechanicalPowerKw
    - mg1MechanicalPowerKw
  const mg2TorqueFromPower = Math.abs(mg2Omega) > 0.5 ? mg2MechanicalPowerKw * 1_000 / mg2Omega : context.requestedMg2TorqueNm
  const mg2TorqueNm = Number.isFinite(mg2TorqueFromPower) ? mg2TorqueFromPower : context.requestedMg2TorqueNm
  const mg1 = motorPort(mg1MechanicalPowerKw, mg1TorqueNm)
  const mg2 = motorPort(mg2MechanicalPowerKw, mg2TorqueNm)
  const inverterLossKw = (Math.abs(mg1.electricalPowerKw) + Math.abs(mg2.electricalPowerKw))
    * (1 / DRIVETRAIN.inverterEfficiency - 1)
  const grossBusPowerKw = mg1.electricalPowerKw + mg2.electricalPowerKw + context.accessoryPowerKw + inverterLossKw
  const mg1InverterShareKw = inverterLossKw * Math.abs(mg1.electricalPowerKw)
    / Math.max(EPSILON, Math.abs(mg1.electricalPowerKw) + Math.abs(mg2.electricalPowerKw))
  const protectedStartReservePowerKw = Math.min(
    context.protectedStartReservePowerKw,
    Math.max(0, mg1.electricalPowerKw + mg1InverterShareKw),
  )
  const batteryTerminalPowerKw = grossBusPowerKw - protectedStartReservePowerKw
  const mechanicalResidualKw = engineMechanicalPowerKw + mg1MechanicalPowerKw + mg2MechanicalPowerKw
    - context.drivetrainWheelPowerKw - drivetrainLossKw - context.enginePumpingLossKw
  const electricalResidualKw = batteryTerminalPowerKw + protectedStartReservePowerKw
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
    batteryTerminalPowerKw,
    drivetrainLossKw,
    accessoryPowerKw: context.accessoryPowerKw,
    protectedStartReservePowerKw,
    mechanicalResidualKw,
    electricalResidualKw,
  }
}

function chooseEngineTorque(
  state: SimulationState,
  inputs: DriverInputs,
  context: Omit<AllocationContext, 'engineTorqueNm'>,
  targetBatteryPowerKw: number,
) {
  if (state.engineState !== 'FUELED' || inputs.selector === 'N' || inputs.brake > 0.02) return 0
  const maximum = engineTorqueLimitNm(context.engineRpm)
  if (maximum <= 0) return 0
  if (inputs.accelerator >= 0.9 && !state.chargeRequestActive) return maximum
  let bestTorque = 0
  let bestError = Number.POSITIVE_INFINITY
  for (let index = 0; index <= 40; index += 1) {
    const torque = maximum * index / 40
    const allocation = allocatePower({ ...context, engineTorqueNm: torque })
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
  dt: number,
) {
  let engineState = state.engineState
  let crankingTimerSeconds = state.crankingTimerSeconds
  let engineOnTimerSeconds = state.engineOnTimerSeconds
  let engineOffTimerSeconds = state.engineOffTimerSeconds
  let stoppingTimerSeconds = state.stoppingTimerSeconds

  if (engineState === 'OFF') {
    engineOffTimerSeconds += dt
    if (fuelRequired && engineOffTimerSeconds >= CONTROL.minimumEngineOffSeconds) {
      engineState = 'CRANKING'
      crankingTimerSeconds = 0
      engineOffTimerSeconds = 0
    } else if (spinRequired) {
      engineState = 'SPINNING_UNFUELED'
      engineOffTimerSeconds = 0
    }
  } else if (engineState === 'CRANKING') {
    crankingTimerSeconds += dt
    if (crankingTimerSeconds >= CONTROL.engineCrankSeconds) {
      engineState = fuelRequired ? 'FUELED' : 'STOPPING'
      engineOnTimerSeconds = 0
      crankingTimerSeconds = 0
      stoppingTimerSeconds = 0
    }
  } else if (engineState === 'FUELED') {
    engineOnTimerSeconds += dt
    if (!fuelRequired && engineOnTimerSeconds >= CONTROL.minimumEngineOnSeconds) {
      engineState = spinRequired ? 'SPINNING_UNFUELED' : 'STOPPING'
      stoppingTimerSeconds = 0
    }
  } else if (engineState === 'SPINNING_UNFUELED') {
    if (fuelRequired) {
      engineState = 'CRANKING'
      crankingTimerSeconds = CONTROL.engineCrankSeconds * 0.55
    } else if (!spinRequired) {
      engineState = 'STOPPING'
      stoppingTimerSeconds = 0
    }
  } else {
    stoppingTimerSeconds += dt
    if (fuelRequired) {
      engineState = 'CRANKING'
      crankingTimerSeconds = 0
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
  return { engineState, crankingTimerSeconds, engineOnTimerSeconds, engineOffTimerSeconds, stoppingTimerSeconds }
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

function chooseMode(
  inputs: DriverInputs,
  state: SimulationState,
  allocation: Allocation,
  regenKw: number,
  frictionKw: number,
  engineBrakeKw: number,
) : OperatingMode {
  if (inputs.selector === 'N') return 'NEUTRAL'
  if (state.engineState === 'CRANKING') return 'ENGINE_START'
  if (inputs.brake > 0.01 || (inputs.selector === 'B' && Math.abs(state.vehicleSpeedMps) > 1 && inputs.accelerator < 0.01)) {
    if (engineBrakeKw > 0.2) return 'ENGINE_BRAKING'
    if (frictionKw > 0.15) return 'BLENDED_BRAKING'
    if (regenKw > 0.1) return 'REGENERATIVE_BRAKING'
  }
  if (inputs.selector === 'P') {
    if (state.engineState === 'FUELED' && state.chargeRequestActive && allocation.batteryTerminalPowerKw < -0.1) return 'STATIONARY_CHARGING'
    return 'PARKED'
  }
  if (inputs.selector === 'R' && inputs.accelerator > 0.01) return 'REVERSE_EV'
  if (inputs.accelerator > 0.01) {
    if (state.engineState === 'FUELED' && state.chargeRequestActive && allocation.batteryTerminalPowerKw < -0.1) return 'ENGINE_DRIVE_AND_CHARGE'
    if (state.engineState === 'FUELED' && allocation.batteryTerminalPowerKw > 1 && allocation.mg1ElectricalPowerKw < -0.5) return 'COMBINED_ACCELERATION'
    if (state.engineState === 'FUELED') return 'ENGINE_DRIVE'
    return 'EV_DRIVE'
  }
  if (Math.abs(state.vehicleSpeedMps) > 0.15) return 'COASTING'
  return 'READY'
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
  const wheelRpm = speedToWheelRpm(speed)
  const ringRpm = wheelRpm * DRIVETRAIN.finalDriveRatio
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
  const unconstrainedPropulsionPowerKw = Math.abs(requestedDriveForceN * speed) / 1_000
  const pedalPowerLimitKw = inputs.accelerator > 0 ? Math.max(8, inputs.accelerator * LIMITS.systemPowerKw) : 0
  const propulsionPowerKw = Math.min(unconstrainedPropulsionPowerKw, pedalPowerLimitKw, LIMITS.systemPowerKw)
  const propulsionNeedsEngine = inputs.accelerator > 0.57 || propulsionPowerKw > 30
  const brakingActive = inputs.brake > 0.01 || (inputs.selector === 'B' && absSpeed > 1 && inputs.accelerator < 0.01)
  const fuelRequired = inputs.selector !== 'N' && !brakingActive && (
    chargeRequestActive
    || warmupRequestActive
    || propulsionNeedsEngine
  )
  const mg1ProtectionRequired = carrierRangeForMg1(ringRpm).minimumRpm > 1
  const spinRequired = (inputs.selector === 'B' && absSpeed > 2 && inputs.accelerator < 0.03) || mg1ProtectionRequired
  const engineTransition = updateEngineState(previous, fuelRequired, spinRequired, dt)

  const rpmTarget = desiredEngineRpm(engineTransition.engineState, inputs, propulsionPowerKw, chargeRequestActive, speedKph)
  const unconstrainedEngineRpm = approach(previous.engineRpm, rpmTarget, CONTROL.engineRpmRatePerSecond * dt)
  const resolvedEngine = resolveCarrierRpm(ringRpm, unconstrainedEngineRpm)
  const engineRpm = engineTransition.engineState === 'OFF' && !mg1ProtectionRequired ? 0 : resolvedEngine.carrierRpm
  const mg1Rpm = resolvedEngine.mg1Rpm
  const mg2Rpm = ringRpm * DRIVETRAIN.mg2ReductionRatio

  const dischargeLimitKw = terminalDischargeLimitKw(previous, dt)
  const chargeLimitKw = terminalChargeLimitKw(previous, dt)
  const accessoryPowerKw = previous.batterySoc <= BATTERY.hardLowerSoc + 1e-6 && engineTransition.engineState !== 'FUELED'
    ? 0
    : BATTERY.accessoryLoadKw

  const gradeRadians = Math.atan(inputs.roadGradePercent / 100)
  const aerodynamicForceN = 0.5 * VEHICLE.airDensityKgM3 * VEHICLE.dragCoefficient * VEHICLE.frontalAreaM2 * speed * absSpeed
  const rollingForceN = absSpeed > 0.02 ? VEHICLE.rollingResistanceCoefficient * VEHICLE.massKg * VEHICLE.gravityMps2 * direction : 0
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
  const engineBrakePowerKw = spinRequired && brakingActive
    ? Math.min(requestedBrakePowerKw, bModeBrakePowerKw > 0 ? Math.max(3, bModeBrakePowerKw * 0.45) : 2.5)
    : 0
  const brakeAfterEngineKw = Math.max(0, requestedBrakePowerKw - engineBrakePowerKw)
  const regenWheelPowerKw = Math.min(
    brakeAfterEngineKw,
    LIMITS.regenPowerKw * speedRegenFactor * socRegenFactor,
    Math.max(0, chargeLimitKw + accessoryPowerKw) / Math.max(DRIVETRAIN.motorEfficiency * DRIVETRAIN.inverterEfficiency, 0.01),
  )
  let frictionBrakePowerKw = Math.max(0, requestedBrakePowerKw - engineBrakePowerKw - regenWheelPowerKw)
  let drivetrainWheelPowerKw = brakingActive
    ? -(regenWheelPowerKw + engineBrakePowerKw)
    : propulsionPowerKw
  let enginePumpingLossKw = engineBrakePowerKw
  const mg1CrankingPowerKw = engineTransition.engineState === 'CRANKING'
    ? Math.min(5.5, Math.abs(mg1Rpm) * TWO_PI / 60 * 55 / 1_000)
    : 0
  if (engineTransition.engineState === 'CRANKING') enginePumpingLossKw += mg1CrankingPowerKw
  if (engineTransition.engineState === 'SPINNING_UNFUELED' && mg1ProtectionRequired && !brakingActive) enginePumpingLossKw += 1.2

  const wheelTorqueRequestNm = requestedDriveForceN * VEHICLE.wheelRadiusM
  const requestedMg2TorqueNm = wheelTorqueRequestNm / (DRIVETRAIN.finalDriveRatio * DRIVETRAIN.mg2ReductionRatio * DRIVETRAIN.mechanicalEfficiency)
  const protectedStartReservePowerKw = previous.batterySoc <= BATTERY.hardLowerSoc + 1e-6 && engineTransition.engineState === 'CRANKING'
    ? 10
    : 0
  const baseContext = {
    engineRpm,
    mg1Rpm,
    mg2Rpm,
    drivetrainWheelPowerKw,
    enginePumpingLossKw,
    requestedMg2TorqueNm,
    accessoryPowerKw,
    mg1CrankingPowerKw,
    protectedStartReservePowerKw,
  }
  const chargeTaper = clamp((BATTERY.chargeClearSoc - previous.batterySoc) / (BATTERY.chargeClearSoc - BATTERY.preferredTargetSoc), 0.45, 1)
  const chargingHeadroom = clamp(1 - Math.max(0, inputs.accelerator - 0.25) / 0.65, 0, 1)
  const targetBatteryPowerKw = chargeRequestActive
    ? -12 * chargeTaper * chargingHeadroom
    : inputs.accelerator > 0.65
      ? 22 * clamp((inputs.accelerator - 0.65) / 0.35, 0, 1)
      : 0
  let targetEngineTorqueNm = chooseEngineTorque(
    { ...previous, engineState: engineTransition.engineState, engineRpm, chargeRequestActive },
    inputs,
    baseContext,
    targetBatteryPowerKw,
  )
  if (engineTransition.engineState === 'FUELED' && inputs.accelerator >= 0.9) targetEngineTorqueNm = engineTorqueLimitNm(engineRpm)
  let engineTorqueNm = approach(previous.engineTorqueNm, targetEngineTorqueNm, CONTROL.engineTorqueRatePerSecond * dt)
  if (engineTransition.engineState !== 'FUELED' || brakingActive || inputs.selector === 'N') engineTorqueNm = approach(previous.engineTorqueNm, 0, CONTROL.engineTorqueRatePerSecond * dt)

  let allocation = allocatePower({ ...baseContext, engineTorqueNm })
  let driveScale = 1
  const propulsionFeasible = (scale: number) => {
    const scaledWheelPower = propulsionPowerKw * scale
    const scaledTorque = requestedMg2TorqueNm * scale
    const candidate = allocatePower({
      ...baseContext,
      drivetrainWheelPowerKw: scaledWheelPower,
      requestedMg2TorqueNm: scaledTorque,
      engineTorqueNm,
    })
    return {
      candidate,
      feasible: candidate.batteryTerminalPowerKw <= dischargeLimitKw + 1e-6
        && Math.abs(candidate.mg2MechanicalPowerKw) <= LIMITS.mg2PowerKw + 1e-6
        && Math.abs(candidate.mg2TorqueNm) <= LIMITS.mg2TorqueNm + 1e-6,
    }
  }
  if (!brakingActive && propulsionPowerKw > 0 && !propulsionFeasible(1).feasible) {
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 28; iteration += 1) {
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

  if (allocation.batteryTerminalPowerKw < -chargeLimitKw - 1e-6 && engineTorqueNm > 0) {
    let bestTorque = 0
    let bestAllocation = allocatePower({ ...baseContext, drivetrainWheelPowerKw, engineTorqueNm: 0 })
    for (let index = 1; index <= 50; index += 1) {
      const candidateTorque = engineTorqueNm * index / 50
      const candidate = allocatePower({ ...baseContext, drivetrainWheelPowerKw, engineTorqueNm: candidateTorque })
      if (candidate.batteryTerminalPowerKw >= -chargeLimitKw - 1e-6) {
        bestTorque = candidateTorque
        bestAllocation = candidate
      } else break
    }
    engineTorqueNm = bestTorque
    allocation = bestAllocation
  }

  let actualRegenWheelPowerKw = regenWheelPowerKw
  if (brakingActive && allocation.batteryTerminalPowerKw < -chargeLimitKw - 1e-6 && regenWheelPowerKw > 0) {
    let low = 0
    let high = regenWheelPowerKw
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const middle = (low + high) / 2
      const candidateWheelPower = -(middle + engineBrakePowerKw)
      const candidate = allocatePower({ ...baseContext, drivetrainWheelPowerKw: candidateWheelPower, engineTorqueNm })
      if (candidate.batteryTerminalPowerKw >= -chargeLimitKw) low = middle
      else high = middle
    }
    actualRegenWheelPowerKw = low
    frictionBrakePowerKw += regenWheelPowerKw - actualRegenWheelPowerKw
    drivetrainWheelPowerKw = -(actualRegenWheelPowerKw + engineBrakePowerKw)
    allocation = allocatePower({ ...baseContext, drivetrainWheelPowerKw, engineTorqueNm })
  }

  // At the hard lower boundary, the tiny bounded engine-start reserve is outside
  // the displayed usable SOC buffer. It may finish the crank, but it cannot propel
  // the wheels or pull the usable battery below 40%.
  if (previous.batterySoc <= BATTERY.hardLowerSoc + 1e-6
    && engineTransition.engineState === 'CRANKING'
    && allocation.batteryTerminalPowerKw > 0) {
    allocation.protectedStartReservePowerKw += allocation.batteryTerminalPowerKw
    allocation.batteryTerminalPowerKw = 0
    allocation.electricalResidualKw = 0
  }

  const effectiveDriveForceN = absSpeed > 0.25
    ? selectorDirection * drivetrainWheelPowerKw * 1_000 / absSpeed
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
  if (parkLockEngaged) netForceN = 0
  const accelerationMps2 = netForceN / VEHICLE.massKg
  let newSpeed = parkLockEngaged ? 0 : clamp(speed + accelerationMps2 * dt, -maxVehicleSpeedMps, maxVehicleSpeedMps)
  if (speed !== 0 && Math.sign(newSpeed) !== Math.sign(speed) && inputs.accelerator < 0.01) newSpeed = 0
  if (inputs.selector !== 'R' && newSpeed < 0 && inputs.roadGradePercent >= 0) newSpeed = 0
  const newPosition = previous.vehiclePositionM + (speed + newSpeed) * 0.5 * dt

  let batteryInternalPowerKw = allocation.batteryTerminalPowerKw >= 0
    ? allocation.batteryTerminalPowerKw / BATTERY.dischargeEfficiency
    : allocation.batteryTerminalPowerKw * BATTERY.chargeEfficiency
  if (Math.abs(allocation.batteryTerminalPowerKw) < EPSILON) batteryInternalPowerKw = 0
  const newBatteryEnergyKwh = previous.batteryEnergyKwh - batteryInternalPowerKw * dt / 3_600
  const newBatterySoc = newBatteryEnergyKwh / BATTERY.nominalCapacityKwh * 100

  const heatRate = engineTransition.engineState === 'FUELED'
    ? 0.055 + allocation.engineMechanicalPowerKw * 0.0016
    : -0.009 * clamp((previous.engineTemperatureC - CONTROL.ambientTemperatureC) / 60, 0, 1)
  const engineTemperatureC = clamp(previous.engineTemperatureC + heatRate * dt, CONTROL.ambientTemperatureC, 105)
  const postKinematics = calculateKinematics(newSpeed, engineRpm)
  const updatedState: SimulationState = {
    ...previous,
    ...engineTransition,
    timeSeconds: previous.timeSeconds + dt,
    vehicleSpeedMps: newSpeed,
    vehiclePositionM: newPosition,
    vehicleAccelerationMps2: dt > 0 ? (newSpeed - speed) / dt : 0,
    batteryEnergyKwh: newBatteryEnergyKwh,
    batterySoc: newBatterySoc,
    engineRpm: postKinematics.carrierRpm,
    engineTorqueNm,
    mg1Rpm: postKinematics.mg1Rpm,
    mg1TorqueNm: allocation.mg1TorqueNm,
    mg2Rpm: postKinematics.mg2Rpm,
    mg2TorqueNm: allocation.mg2TorqueNm,
    engineTemperatureC,
    chargeRequestActive,
    warmupRequestActive,
    parkLockEngaged,
    operatingMode: previous.operatingMode,
  }
  const mode = chooseMode(inputs, updatedState, allocation, actualRegenWheelPowerKw, frictionBrakePowerKw, engineBrakePowerKw)
  updatedState.operatingMode = mode

  const aerodynamicLossKw = Math.abs(aerodynamicForceN * speed) / 1_000
  const rollingResistanceLossKw = Math.abs(rollingForceN * speed) / 1_000
  const roadGradePowerKw = gradeForceN * speed / 1_000
  const wheelPowerKw = drivetrainWheelPowerKw - frictionBrakePowerKw
  const diagnostics: PowerDiagnostics = {
    engineMechanicalPowerKw: allocation.engineMechanicalPowerKw,
    mg1MechanicalPowerKw: allocation.mg1MechanicalPowerKw,
    mg1ElectricalPowerKw: allocation.mg1ElectricalPowerKw,
    mg2MechanicalPowerKw: allocation.mg2MechanicalPowerKw,
    mg2ElectricalPowerKw: allocation.mg2ElectricalPowerKw,
    batteryTerminalPowerKw: allocation.batteryTerminalPowerKw,
    batteryInternalPowerKw,
    accessoryPowerKw: allocation.accessoryPowerKw,
    protectedStartReservePowerKw: allocation.protectedStartReservePowerKw,
    inverterLossKw: allocation.inverterLossKw,
    motorLossKw: allocation.motorLossKw,
    drivetrainLossKw: allocation.drivetrainLossKw,
    drivetrainWheelPowerKw,
    wheelPowerKw,
    aerodynamicLossKw,
    rollingResistanceLossKw,
    roadGradePowerKw,
    roadLoadPowerKw: aerodynamicLossKw + rollingResistanceLossKw + roadGradePowerKw,
    regenerativeBrakingKw: actualRegenWheelPowerKw,
    frictionBrakeLossKw: frictionBrakePowerKw,
    enginePumpingLossKw,
    totalRequestedBrakingKw: requestedBrakePowerKw,
    electricalBalanceResidualKw: allocation.electricalResidualKw,
    mechanicalBalanceResidualKw: allocation.mechanicalResidualKw,
    powerBalanceResidualKw: Math.max(Math.abs(allocation.electricalResidualKw), Math.abs(allocation.mechanicalResidualKw)),
    planetaryResidualRpmTeeth: planetaryResidual(postKinematics.ringRpm, postKinematics.mg1Rpm, postKinematics.carrierRpm),
    mg2RatioResidualRpm: postKinematics.mg2Rpm - postKinematics.wheelRpm * DRIVETRAIN.finalDriveRatio * DRIVETRAIN.mg2ReductionRatio,
  }
  const copy = MODE_COPY[mode]
  const flows = inputs.selector === 'N'
    ? []
    : createEnergyFlows(allocation, drivetrainWheelPowerKw, actualRegenWheelPowerKw, frictionBrakePowerKw, engineBrakePowerKw, engineTransition.engineState)
  const telemetry: SimulationTelemetry = {
    ...diagnostics,
    vehicleSpeedKph: newSpeed * 3.6,
    vehicleAccelerationMps2: updatedState.vehicleAccelerationMps2,
    vehiclePositionM: newPosition,
    wheelRpm: postKinematics.wheelRpm,
    ringRpm: postKinematics.ringRpm,
    carrierRpm: postKinematics.carrierRpm,
    engineRpm: postKinematics.carrierRpm,
    engineTorqueNm,
    mg1Rpm: postKinematics.mg1Rpm,
    mg1TorqueNm: allocation.mg1TorqueNm,
    mg2Rpm: postKinematics.mg2Rpm,
    mg2TorqueNm: allocation.mg2TorqueNm,
    wheelTorqueNm: (effectiveDriveForceN - totalBrakeForceN * brakeDirection) * VEHICLE.wheelRadiusM,
    batterySoc: newBatterySoc,
    engineTemperatureC,
    chargeRequestActive,
    socTargetPercent: BATTERY.preferredTargetSoc,
    engineState: engineTransition.engineState,
    operatingMode: mode,
    modeLabel: copy.label,
    description: copy.description,
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
