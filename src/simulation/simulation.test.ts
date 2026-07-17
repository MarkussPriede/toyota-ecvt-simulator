import { describe, expect, it } from 'vitest'
import { BATTERY, DRIVETRAIN, LIMITS, MG2_REDUCTION, POWER_SPLIT, maxVehicleSpeedMps } from './constants'
import { calculateKinematics, createInitialSimulationState, DEFAULT_DRIVER_INPUTS, stepSimulation } from './engine'
import { planetaryResidual } from './planetary'
import { runScenario, scenarioById } from './scenarios'
import type { DriverInputs, SimulationState, SimulationStepResult } from './types'

function simulate(
  state: SimulationState,
  inputs: DriverInputs,
  durationSeconds: number,
  timestepSeconds = 1 / 60,
) {
  let result: SimulationStepResult = stepSimulation(state, inputs, 0)
  for (let elapsed = 0; elapsed < durationSeconds - 1e-9; elapsed += timestepSeconds) {
    result = stepSimulation(result.state, inputs, Math.min(timestepSeconds, durationSeconds - elapsed))
  }
  return result
}

const drive = (accelerator = 0, brake = 0): DriverInputs => ({
  ...DEFAULT_DRIVER_INPUTS,
  selector: 'D',
  accelerator,
  brake,
})

describe('vehicle movement and signed energy', () => {
  it('launches from zero on MG2 torque and discharges the battery', () => {
    const start = createInitialSimulationState({ batterySoc: 60, engineTemperatureC: 82 })
    const result = simulate(start, drive(0.4), 10)
    expect(result.state.vehicleSpeedMps).toBeGreaterThan(8)
    expect(result.state.batterySoc).toBeLessThan(60)
    expect(result.state.engineState).toBe('OFF')
    expect(result.telemetry.mg2TorqueNm).toBeGreaterThan(0)
    expect(result.telemetry.mg2MechanicalPowerKw).toBeGreaterThan(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeGreaterThan(0)
  })

  it('launches backward in Reverse with battery discharge', () => {
    const start = createInitialSimulationState({ batterySoc: 60 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'R', accelerator: 0.4 }, 8)
    expect(result.state.vehicleSpeedMps).toBeLessThan(-4)
    expect(result.state.batterySoc).toBeLessThan(60)
    expect(result.telemetry.mg2Rpm).toBeLessThan(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeGreaterThan(0)
  })

  it('coasts down under road load without reporting friction braking', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 50, batterySoc: 55 })
    const result = simulate(start, drive(), 12)
    expect(result.telemetry.vehicleSpeedKph).toBeLessThan(50)
    expect(result.telemetry.roadLoadPowerKw).toBeGreaterThan(0)
    expect(result.telemetry.frictionBrakeLossKw).toBe(0)
  })

  it('blends regeneration out near zero and uses friction to complete a stop', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 35, batterySoc: 55 })
    const result = simulate(start, drive(0, 0.62), 8)
    expect(Math.abs(result.state.vehicleSpeedMps)).toBeLessThan(0.1)
    expect(result.telemetry.regenerativeBrakingKw).toBe(0)
    expect(result.telemetry.frictionBrakeLossKw).toBeGreaterThanOrEqual(0)
  })

  it('regenerates with consistent mechanical and electrical signs', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 60, batterySoc: 55 })
    const result = simulate(start, drive(0, 0.35), 3)
    expect(result.state.vehicleSpeedMps).toBeLessThan(start.vehicleSpeedMps)
    expect(result.telemetry.mg2MechanicalPowerKw).toBeLessThan(0)
    expect(result.telemetry.mg2ElectricalPowerKw).toBeLessThan(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeLessThan(0)
    expect(result.state.batterySoc).toBeGreaterThan(55)
  })
})

describe('charge sustain and protected battery window', () => {
  it('drives and charges from 43% SOC until the 60% hysteresis clearing threshold', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 50, batterySoc: 43, engineTemperatureC: 82 })
    let result = simulate(start, drive(0.25), 4)
    expect(result.state.engineState).toBe('FUELED')
    expect(result.state.chargeRequestActive).toBe(true)
    expect(result.telemetry.operatingMode).toBe('ENGINE_DRIVE_AND_CHARGE')
    expect(result.telemetry.mg1MechanicalPowerKw).toBeLessThan(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeLessThan(0)
    expect(result.telemetry.vehicleSpeedKph).toBeGreaterThan(45)
    for (let elapsed = 0; elapsed < 150 && result.state.chargeRequestActive; elapsed += 0.5) {
      result = stepSimulation(result.state, drive(0.25), 0.5)
    }
    expect(result.state.batterySoc).toBeGreaterThanOrEqual(60)
    expect(result.state.chargeRequestActive).toBe(false)
  })

  it('latches charge request through the 45-60% hysteresis band', () => {
    let result = simulate(createInitialSimulationState({ batterySoc: 44.8, vehicleSpeedKph: 45 }), drive(0.2), 12)
    expect(result.state.batterySoc).toBeGreaterThan(45)
    expect(result.state.chargeRequestActive).toBe(true)
    for (let elapsed = 0; elapsed < 150 && result.state.chargeRequestActive; elapsed += 0.5) {
      result = stepSimulation(result.state, drive(0.2), 0.5)
    }
    expect(result.state.chargeRequestActive).toBe(false)
    expect(result.state.batterySoc).toBeGreaterThanOrEqual(BATTERY.chargeClearSoc - 0.2)
  })

  it('stationary charging includes bounded cranking and stops only after the clearing threshold', () => {
    const start = createInitialSimulationState({ batterySoc: 43, engineTemperatureC: 82 })
    const duringCrank = simulate(start, DEFAULT_DRIVER_INPUTS, 0.4)
    expect(duringCrank.state.engineState).toBe('CRANKING')
    expect(duringCrank.telemetry.engineMechanicalPowerKw).toBe(0)
    const running = simulate(duringCrank.state, DEFAULT_DRIVER_INPUTS, 1)
    expect(running.state.engineState).toBe('FUELED')
    expect(running.telemetry.batteryTerminalPowerKw).toBeLessThan(0)
    let charged = running
    for (let elapsed = 0; elapsed < 150 && charged.state.chargeRequestActive; elapsed += 0.5) {
      charged = stepSimulation(charged.state, DEFAULT_DRIVER_INPUTS, 0.5)
    }
    expect(charged.state.batterySoc).toBeGreaterThanOrEqual(60)
    expect(charged.state.chargeRequestActive).toBe(false)
  })

  it('tapers high-SOC regeneration and never crosses the upper boundary', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 65, batterySoc: 79.8 })
    let result = stepSimulation(start, drive(0, 0.65), 0.1)
    let maximumFrictionKw = result.telemetry.frictionBrakeLossKw
    for (let elapsed = 0.1; elapsed < 8; elapsed += 0.1) {
      result = stepSimulation(result.state, drive(0, 0.65), 0.1)
      maximumFrictionKw = Math.max(maximumFrictionKw, result.telemetry.frictionBrakeLossKw)
    }
    expect(result.state.batterySoc).toBeLessThanOrEqual(BATTERY.hardUpperSoc + 1e-7)
    expect(maximumFrictionKw).toBeGreaterThan(0)
  })

  it('prevents ordinary EV discharge at the lower boundary', () => {
    const start = createInitialSimulationState({ batterySoc: BATTERY.hardLowerSoc })
    const first = stepSimulation(start, drive(0.35), 0.25)
    expect(first.state.batterySoc).toBeGreaterThanOrEqual(BATTERY.hardLowerSoc - 1e-7)
    expect(first.telemetry.mg2MechanicalPowerKw).toBeLessThanOrEqual(0.1)
    expect(first.state.engineState).toBe('CRANKING')
  })
})

describe('engine state machine and braking modes', () => {
  it('never remains in CRANKING beyond the documented transient', () => {
    const start = createInitialSimulationState({ batterySoc: 43 })
    const result = simulate(start, DEFAULT_DRIVER_INPUTS, 1.2)
    expect(result.state.engineState).toBe('FUELED')
    expect(result.state.crankingTimerSeconds).toBe(0)
  })

  it('prioritizes propulsion rather than aggressive charging at full accelerator', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 70, batterySoc: 50 })
    const result = simulate(start, drive(0.95), 5)
    expect(result.telemetry.vehicleSpeedKph).toBeGreaterThan(70)
    expect(result.telemetry.engineMechanicalPowerKw).toBeGreaterThan(45)
    expect(result.telemetry.batteryTerminalPowerKw).toBeGreaterThan(-1)
  })

  it('uses an unfueled spinning engine plus regeneration in B mode', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 80, batterySoc: 72 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'B', roadGradePercent: -5 }, 2)
    expect(result.state.engineState).toBe('SPINNING_UNFUELED')
    expect(result.telemetry.enginePumpingLossKw).toBeGreaterThan(0)
    expect(result.telemetry.regenerativeBrakingKw).toBeGreaterThan(0)
    expect(result.telemetry.frictionBrakeLossKw).toBeGreaterThanOrEqual(0)
  })

  it('commands no propulsion, regeneration, or active charging in Neutral', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 50, batterySoc: 43 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'N' }, 4)
    expect(result.telemetry.operatingMode).toBe('NEUTRAL')
    expect(result.telemetry.regenerativeBrakingKw).toBe(0)
    expect(result.telemetry.engineMechanicalPowerKw).toBe(0)
    expect(result.telemetry.energyFlows).toHaveLength(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeGreaterThanOrEqual(0)
  })
})

describe('rigid kinematics', () => {
  it.each([0, 20, 50, 90, maxVehicleSpeedMps * 3.6, -25])('keeps MG2 on its fixed ratio at %s km/h', (speedKph) => {
    const carrier = Math.abs(speedKph) > 150 ? 1_200 : 0
    const kinematics = calculateKinematics(speedKph / 3.6, carrier)
    expect(kinematics.mg2Rpm).toBeCloseTo(kinematics.wheelRpm * DRIVETRAIN.finalDriveRatio * DRIVETRAIN.mg2ReductionRatio, 10)
    expect(Math.abs(kinematics.mg2Rpm)).toBeLessThanOrEqual(LIMITS.mg2Rpm + 1e-6)
  })

  it('protects MG1 by rotating the carrier and preserves the exact planetary equation', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 170, batterySoc: 58 })
    const result = simulate(start, drive(), 2)
    expect(result.telemetry.mg1LimitActive).toBe(true)
    expect(Math.abs(result.telemetry.mg1Rpm)).toBeLessThanOrEqual(LIMITS.mg1Rpm + 1e-6)
    expect(result.telemetry.engineRpm).toBeGreaterThan(0)
    expect(planetaryResidual(result.telemetry.ringRpm, result.telemetry.mg1Rpm, result.telemetry.carrierRpm)).toBeCloseTo(0, 7)
    expect(POWER_SPLIT.ringTeeth).toBe(POWER_SPLIT.sunTeeth + 2 * POWER_SPLIT.planetTeeth)
    expect(MG2_REDUCTION.ringTeeth).toBe(MG2_REDUCTION.sunTeeth + 2 * MG2_REDUCTION.planetTeeth)
  })
})

describe('power reconciliation and determinism', () => {
  it.each([
    ['ev', createInitialSimulationState({ batterySoc: 60 }), drive(0.4), 4],
    ['charge', createInitialSimulationState({ batterySoc: 43, vehicleSpeedKph: 50 }), drive(0.25), 5],
    ['full', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 70 }), drive(0.95), 5],
    ['regen', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 60 }), drive(0, 0.35), 2],
    ['b-mode', createInitialSimulationState({ batterySoc: 72, vehicleSpeedKph: 80 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'B' as const }, 3],
  ])('balances electrical and mechanical ports in %s', (_name, state, inputs, duration) => {
    const result = simulate(state as SimulationState, inputs as DriverInputs, duration as number)
    const throughput = Math.max(
      1,
      Math.abs(result.telemetry.engineMechanicalPowerKw)
        + Math.abs(result.telemetry.mg1MechanicalPowerKw)
        + Math.abs(result.telemetry.mg2MechanicalPowerKw),
    )
    expect(Math.abs(result.telemetry.electricalBalanceResidualKw)).toBeLessThan(1e-8)
    expect(Math.abs(result.telemetry.mechanicalBalanceResidualKw)).toBeLessThan(1e-8)
    expect(result.telemetry.powerBalanceResidualKw).toBeLessThan(Math.max(1, throughput * 0.02))
  })

  it('is frame-rate independent at 30, 60, and 120 Hz', () => {
    const finals = [30, 60, 120].map((hz) => runScenario({
      initialState: createInitialSimulationState({ batterySoc: 58 }),
      initialInputs: drive(0.45),
      inputTimeline: [],
      durationSeconds: 18,
      timestepSeconds: 1 / hz,
    }).slice(-1)[0]!)
    expect(Math.max(...finals.map((sample) => sample.state.vehicleSpeedMps)) - Math.min(...finals.map((sample) => sample.state.vehicleSpeedMps))).toBeLessThan(0.015)
    expect(Math.max(...finals.map((sample) => sample.state.batterySoc)) - Math.min(...finals.map((sample) => sample.state.batterySoc))).toBeLessThan(0.003)
  })

  it('produces deterministic presets independent of prior runs', () => {
    const preset = scenarioById('ev-launch')!
    const run = () => runScenario({
      initialState: preset.initialState,
      initialInputs: preset.initialInputs,
      inputTimeline: preset.inputTimeline,
      durationSeconds: preset.durationSeconds,
      timestepSeconds: 1 / 60,
    }).slice(-1)[0]!
    const first = run()
    runScenario({ initialState: createInitialSimulationState({ batterySoc: 43 }), initialInputs: DEFAULT_DRIVER_INPUTS, inputTimeline: [], durationSeconds: 20, timestepSeconds: 1 / 30 })
    const second = run()
    expect(second.state.vehicleSpeedMps).toBeCloseTo(first.state.vehicleSpeedMps, 10)
    expect(second.state.batterySoc).toBeCloseTo(first.state.batterySoc, 10)
  })
})
