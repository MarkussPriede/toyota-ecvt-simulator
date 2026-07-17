import { describe, expect, it } from 'vitest'
import {
  BATTERY,
  LIMITS,
  MG2_REDUCTION,
  POWER_SPLIT,
  maxVehicleSpeedMps,
} from './constants'
import { calculateKinematics, createInitialSimulationState, DEFAULT_DRIVER_INPUTS, stepSimulation } from './engine'
import { planetaryResidual } from './planetary'
import { runScenario, scenarioById } from './scenarios'
import type { DriverInputs, EngineState, SimulationState, SimulationStepResult } from './types'

const TWO_PI = Math.PI * 2

function simulateTrace(
  state: SimulationState,
  inputs: DriverInputs,
  durationSeconds: number,
  timestepSeconds = 1 / 60,
) {
  const samples: SimulationStepResult[] = []
  let result = stepSimulation(state, inputs, 0)
  for (let elapsed = 0; elapsed < durationSeconds - 1e-9; elapsed += timestepSeconds) {
    result = stepSimulation(result.state, inputs, Math.min(timestepSeconds, durationSeconds - elapsed))
    samples.push(result)
  }
  return samples
}

function simulate(state: SimulationState, inputs: DriverInputs, durationSeconds: number, timestepSeconds = 1 / 60) {
  return simulateTrace(state, inputs, durationSeconds, timestepSeconds).slice(-1)[0]!
}

const drive = (accelerator = 0, brake = 0): DriverInputs => ({
  ...DEFAULT_DRIVER_INPUTS,
  selector: 'D',
  accelerator,
  brake,
})

function maximum(samples: SimulationStepResult[], field: keyof SimulationStepResult['telemetry']) {
  return Math.max(...samples.map((sample) => Math.abs(Number(sample.telemetry[field]))))
}

function expectIndependentLimits(samples: SimulationStepResult[], tolerance = 1e-6) {
  const violationFields = [
    'engineTorqueViolationNm',
    'enginePowerViolationKw',
    'mg1TorqueViolationNm',
    'mg1PowerViolationKw',
    'mg2TorqueViolationNm',
    'mg2PowerViolationKw',
    'batteryDischargeViolationKw',
    'batteryChargeViolationKw',
    'inverterThroughputViolationKw',
  ] as const
  for (const field of violationFields) expect(maximum(samples, field), field).toBeLessThanOrEqual(tolerance)
}

describe('vehicle motion and signed energy', () => {
  it('launches from zero on MG2 torque and discharges the battery', () => {
    const start = createInitialSimulationState({ batterySoc: 60, engineTemperatureC: 82 })
    const result = simulate(start, drive(0.4), 10)
    expect(result.state.vehicleSpeedMps).toBeGreaterThan(8)
    expect(result.state.batterySoc).toBeLessThan(60)
    expect(result.state.engineState).toBe('OFF')
    expect(result.telemetry.mg2Rpm).toBeLessThan(0)
    expect(result.telemetry.mg2TorqueNm).toBeLessThan(0)
    expect(result.telemetry.mg2MechanicalPowerKw).toBeGreaterThan(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeGreaterThan(0)
  })

  it('launches backward while the fixed-carrier MG2 sun reverses its forward-drive signs', () => {
    const start = createInitialSimulationState({ batterySoc: 60 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'R', accelerator: 0.4 }, 8)
    expect(result.state.vehicleSpeedMps).toBeLessThan(-4)
    expect(result.state.batterySoc).toBeLessThan(60)
    expect(result.telemetry.mg2Rpm).toBeGreaterThan(0)
    expect(result.telemetry.mg2TorqueNm).toBeGreaterThan(0)
    expect(result.telemetry.mg2MechanicalPowerKw).toBeGreaterThan(0)
  })

  it('coasts down under road load without reporting friction braking', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 50, batterySoc: 55 })
    const result = simulate(start, drive(), 12)
    expect(result.telemetry.vehicleSpeedKph).toBeLessThan(50)
    expect(result.telemetry.vehicleMotionState).toBe('COASTING')
    expect(result.telemetry.roadLoadPowerKw).toBeGreaterThan(0)
    expect(result.telemetry.frictionBrakeLossKw).toBe(0)
  })

  it('uses a positive amount of friction braking during a hard stop', () => {
    const samples = simulateTrace(createInitialSimulationState({ vehicleSpeedKph: 72, batterySoc: 55 }), drive(0, 0.88), 8)
    expect(Math.abs(samples[samples.length - 1]!.state.vehicleSpeedMps)).toBeLessThan(0.1)
    expect(maximum(samples, 'frictionBrakeLossKw')).toBeGreaterThan(5)
  })

  it('regenerates with consistent fixed-carrier mechanical and electrical signs', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 60, batterySoc: 55 })
    const result = simulate(start, drive(0, 0.35), 3)
    expect(result.state.vehicleSpeedMps).toBeLessThan(start.vehicleSpeedMps)
    expect(result.telemetry.mg2Rpm).toBeLessThan(0)
    expect(result.telemetry.mg2TorqueNm).toBeGreaterThan(0)
    expect(result.telemetry.mg2MechanicalPowerKw).toBeLessThan(0)
    expect(result.telemetry.mg2ElectricalPowerKw).toBeLessThan(0)
    expect(result.telemetry.batteryTerminalPowerKw).toBeLessThan(0)
  })
})

describe('brake hold, objectives, Reverse, and Neutral', () => {
  it('starts and charges at low SOC while stationary in D with the brake held', () => {
    const held = { ...DEFAULT_DRIVER_INPUTS, selector: 'D' as const, brake: 0.45 }
    const result = simulate(createInitialSimulationState({ batterySoc: 43, engineTemperatureC: 82 }), held, 4)
    expect(result.state.vehicleSpeedMps).toBe(0)
    expect(result.state.engineState).toBe('FUELED')
    expect(result.telemetry.vehicleMotionState).toBe('STATIONARY')
    expect(result.telemetry.systemObjective).toBe('CHARGING')
    expect(result.telemetry.batteryTerminalPowerKw).toBeLessThan(0)
  })

  it('warms a cold engine while stationary in D with the brake held', () => {
    const held = { ...DEFAULT_DRIVER_INPUTS, selector: 'D' as const, brake: 0.45 }
    const start = createInitialSimulationState({ batterySoc: 58, engineTemperatureC: 25 })
    const result = simulate(start, held, 8)
    expect(result.state.vehicleSpeedMps).toBe(0)
    expect(result.state.engineState).toBe('FUELED')
    expect(result.telemetry.systemObjective).toBe('WARM_UP')
    expect(result.state.engineTemperatureC).toBeGreaterThan(start.engineTemperatureC)
  })

  it('reports coasting motion independently from the charging objective', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: 55, batterySoc: 43, engineTemperatureC: 82 })
    const result = simulate(start, drive(), 4)
    expect(result.telemetry.vehicleMotionState).toBe('COASTING')
    expect(result.telemetry.systemObjective).toBe('CHARGING')
    expect(result.state.engineState).toBe('FUELED')
    expect(result.telemetry.batteryTerminalPowerKw).toBeLessThan(0)
  })

  it.each([
    ['low SOC', { batterySoc: 43, engineTemperatureC: 82 }],
    ['cold engine', { batterySoc: 58, engineTemperatureC: 25 }],
  ])('allows the engine to run during reverse motion for %s', (_name, options) => {
    const inputs = { ...DEFAULT_DRIVER_INPUTS, selector: 'R' as const, accelerator: 0.35 }
    const result = simulate(createInitialSimulationState(options), inputs, 6)
    expect(result.state.vehicleSpeedMps).toBeLessThan(-2)
    expect(result.telemetry.vehicleMotionState).toBe('REVERSING')
    expect(result.state.engineState).toBe('FUELED')
    expect(['CHARGING', 'WARM_UP']).toContain(result.telemetry.systemObjective)
  })

  it('continues coasting naturally in Neutral after selecting N while reversing', () => {
    const start = createInitialSimulationState({ vehicleSpeedKph: -30, batterySoc: 58 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'N' }, 3)
    expect(result.state.vehicleSpeedMps).toBeLessThan(-1)
    expect(Math.abs(result.state.vehicleSpeedMps)).toBeLessThan(Math.abs(start.vehicleSpeedMps))
    expect(result.telemetry.vehicleMotionState).toBe('REVERSING')
    expect(result.telemetry.systemObjective).toBe('ENGINE_OFF')
    expect(result.telemetry.energyFlows).toHaveLength(0)
  })

  it('allows a stationary car in Neutral to roll backward on an uphill grade', () => {
    const start = createInitialSimulationState({ batterySoc: 58 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'N', roadGradePercent: 6 }, 3)
    expect(result.state.vehicleSpeedMps).toBeLessThan(-0.5)
    expect(result.telemetry.vehicleMotionState).toBe('REVERSING')
  })

  it('does not give D an undocumented anti-rollback clamp', () => {
    const start = createInitialSimulationState({ batterySoc: 60 })
    const result = simulate(start, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', roadGradePercent: 8 }, 2)
    expect(result.state.vehicleSpeedMps).toBeLessThan(0)
  })
})

describe('engine state integrity and protected reserve', () => {
  it.each<EngineState>(['OFF', 'CRANKING', 'STOPPING', 'SPINNING_UNFUELED'])(
    'reports zero combustion torque and power in %s',
    (engineState) => {
      const start = createInitialSimulationState({
        vehicleSpeedKph: engineState === 'SPINNING_UNFUELED' ? 70 : 0,
        batterySoc: engineState === 'CRANKING' ? 43 : 60,
        engineState,
        engineRpm: engineState === 'OFF' ? 0 : 1_200,
      })
      const inputs = engineState === 'SPINNING_UNFUELED'
        ? { ...DEFAULT_DRIVER_INPUTS, selector: 'B' as const }
        : DEFAULT_DRIVER_INPUTS
      const result = stepSimulation(start, inputs, 1 / 120)
      expect(result.telemetry.engineTorqueNm).toBe(0)
      expect(result.telemetry.engineMechanicalPowerKw).toBe(0)
    },
  )

  it('relights a sufficiently spinning unfueled engine without a crank cycle', () => {
    const start = createInitialSimulationState({
      vehicleSpeedKph: 50,
      batterySoc: 43,
      engineState: 'SPINNING_UNFUELED',
      engineRpm: 1_500,
    })
    const result = stepSimulation(start, drive(0.2), 1 / 120)
    expect(result.state.engineState).toBe('FUELED')
    expect(result.state.crankingTimerSeconds).toBe(0)
    expect(result.telemetry.protectedReservePowerKw).toBe(0)
  })

  it('keeps accessories visible and integrates finite protected reserve energy at 40% SOC', () => {
    const start = createInitialSimulationState({ batterySoc: BATTERY.hardLowerSoc })
    const result = simulate(start, DEFAULT_DRIVER_INPUTS, 0.5)
    expect(result.telemetry.accessoryPowerKw).toBe(BATTERY.accessoryLoadKw)
    expect(result.telemetry.protectedReservePowerKw).toBeGreaterThan(0)
    expect(result.state.protectedReserveEnergyKwh).toBeLessThan(start.protectedReserveEnergyKwh)
    expect(result.state.batterySoc).toBeGreaterThanOrEqual(BATTERY.hardLowerSoc)
  })

  it('never remains in CRANKING beyond the bounded transient', () => {
    const result = simulate(createInitialSimulationState({ batterySoc: 43 }), DEFAULT_DRIVER_INPUTS, 1.2)
    expect(result.state.engineState).toBe('FUELED')
    expect(result.state.crankingTimerSeconds).toBe(0)
  })

  it('keeps the charge request latched through the 45-60% band', () => {
    let result = simulate(createInitialSimulationState({ batterySoc: 44.8, vehicleSpeedKph: 45 }), drive(0.2), 12)
    expect(result.state.batterySoc).toBeGreaterThan(45)
    expect(result.state.chargeRequestActive).toBe(true)
    for (let elapsed = 0; elapsed < 160 && result.state.chargeRequestActive; elapsed += 0.1) {
      result = stepSimulation(result.state, drive(0.2), 0.1)
    }
    expect(result.state.chargeRequestActive).toBe(false)
    expect(result.state.batterySoc).toBeGreaterThanOrEqual(BATTERY.chargeClearSoc - 0.05)
  })

  it('tapers high-SOC regeneration and never crosses the upper boundary', () => {
    const samples = simulateTrace(createInitialSimulationState({ vehicleSpeedKph: 65, batterySoc: 79.8 }), drive(0, 0.65), 8, 0.1)
    expect(samples[samples.length - 1]!.state.batterySoc).toBeLessThanOrEqual(BATTERY.hardUpperSoc + 1e-7)
    expect(maximum(samples, 'frictionBrakeLossKw')).toBeGreaterThan(0)
  })
})

describe('rigid signed kinematics and consistent-instant telemetry', () => {
  it.each([0, 20, 50, 90, maxVehicleSpeedMps * 3.6, -25])(
    'satisfies the fixed-carrier MG2 relationship at %s km/h',
    (speedKph) => {
      const carrier = Math.abs(speedKph) > 150 ? 1_200 : 0
      const kinematics = calculateKinematics(speedKph / 3.6, carrier)
      expect(kinematics.mg2Rpm).toBeCloseTo(-kinematics.ringRpm * MG2_REDUCTION.ringTeeth / MG2_REDUCTION.sunTeeth, 10)
      expect(MG2_REDUCTION.ringTeeth * kinematics.ringRpm + MG2_REDUCTION.sunTeeth * kinematics.mg2Rpm).toBeCloseTo(0, 8)
      expect(Math.abs(kinematics.mg2Rpm)).toBeLessThanOrEqual(LIMITS.mg2Rpm + 1e-6)
    },
  )

  it('protects MG1 without breaking the power-split equation', () => {
    const result = simulate(createInitialSimulationState({ vehicleSpeedKph: 170, batterySoc: 58 }), drive(), 2)
    expect(result.telemetry.mg1LimitActive).toBe(true)
    expect(Math.abs(result.telemetry.mg1Rpm)).toBeLessThanOrEqual(LIMITS.mg1Rpm + 1e-6)
    expect(result.telemetry.engineRpm).toBeGreaterThan(0)
    expect(planetaryResidual(result.telemetry.ringRpm, result.telemetry.mg1Rpm, result.telemetry.carrierRpm)).toBeCloseTo(0, 7)
    expect(POWER_SPLIT.ringTeeth).toBe(POWER_SPLIT.sunTeeth + 2 * POWER_SPLIT.planetTeeth)
  })

  it.each([
    ['EV', createInitialSimulationState({ batterySoc: 60 }), drive(0.4), 4],
    ['charge', createInitialSimulationState({ batterySoc: 43, vehicleSpeedKph: 50 }), drive(0.25), 5],
    ['full power', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 70 }), drive(0.95), 5],
    ['regen', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 60 }), drive(0, 0.35), 2],
    ['B mode', createInitialSimulationState({ batterySoc: 72, vehicleSpeedKph: 80 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'B' as const }, 3],
  ])('reports component P = Tω at one consistent instant in %s', (_name, state, inputs, duration) => {
    const result = simulate(state as SimulationState, inputs as DriverInputs, duration as number)
    const enginePower = result.telemetry.engineTorqueNm * result.telemetry.engineRpm * TWO_PI / 60 / 1_000
    const mg1Power = result.telemetry.mg1TorqueNm * result.telemetry.mg1Rpm * TWO_PI / 60 / 1_000
    const mg2Power = result.telemetry.mg2TorqueNm * result.telemetry.mg2Rpm * TWO_PI / 60 / 1_000
    expect(result.telemetry.engineMechanicalPowerKw).toBeCloseTo(enginePower, 9)
    expect(result.telemetry.mg1MechanicalPowerKw).toBeCloseTo(mg1Power, 9)
    expect(result.telemetry.mg2MechanicalPowerKw).toBeCloseTo(mg2Power, 9)
  })
})

describe('independent component feasibility', () => {
  it.each([
    ['EV launch', createInitialSimulationState({ batterySoc: 60 }), drive(0.7), 10],
    ['low-SOC charge', createInitialSimulationState({ batterySoc: 43, vehicleSpeedKph: 50 }), drive(0.25), 8],
    ['full power', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 70 }), drive(0.95), 8],
    ['regeneration', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 80 }), drive(0, 0.7), 5],
    ['reverse', createInitialSimulationState({ batterySoc: 43 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'R' as const, accelerator: 0.5 }, 8],
    ['B mode', createInitialSimulationState({ batterySoc: 72, vehicleSpeedKph: 90 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'B' as const, roadGradePercent: -6 }, 8],
  ])('keeps engine, MG1, MG2, battery, and inverter within independent limits in %s', (_name, state, inputs, duration) => {
    const samples = simulateTrace(state as SimulationState, inputs as DriverInputs, duration as number)
    expectIndependentLimits(samples)
    expect(maximum(samples, 'engineTorqueNm')).toBeLessThanOrEqual(LIMITS.engineTorqueNm + 1e-6)
    expect(maximum(samples, 'mg1TorqueNm')).toBeLessThanOrEqual(LIMITS.mg1TorqueNm + 1e-6)
    expect(maximum(samples, 'mg2TorqueNm')).toBeLessThanOrEqual(LIMITS.mg2TorqueNm + 1e-6)
    expect(maximum(samples, 'inverterThroughputKw')).toBeLessThanOrEqual(LIMITS.inverterThroughputKw + 1e-6)
  })

  it('prioritizes propulsion rather than aggressive charging at full accelerator', () => {
    const result = simulate(createInitialSimulationState({ vehicleSpeedKph: 70, batterySoc: 50 }), drive(0.95), 5)
    expect(result.telemetry.vehicleSpeedKph).toBeGreaterThan(70)
    expect(result.telemetry.engineMechanicalPowerKw).toBeGreaterThan(40)
    expect(result.telemetry.batteryTerminalPowerKw).toBeGreaterThan(-1)
    expect(result.telemetry.systemObjective).toBe('ASSISTING')
  })

  it('maintains near-zero electrical and mechanical accounting residuals separately from feasibility', () => {
    const samples = simulateTrace(createInitialSimulationState({ batterySoc: 43, vehicleSpeedKph: 50 }), drive(0.25), 8)
    expect(maximum(samples, 'electricalBalanceResidualKw')).toBeLessThan(1e-8)
    expect(maximum(samples, 'mechanicalBalanceResidualKw')).toBeLessThan(1e-8)
    expectIndependentLimits(samples)
  })
})

describe('classification stability and frame-rate independence', () => {
  it('does not flicker rapidly when requests hover around display thresholds', () => {
    let state = createInitialSimulationState({ vehicleSpeedKph: 50, batterySoc: 58 })
    let previousMotion = state.vehicleMotionState
    let previousObjective = state.systemObjective
    let motionTransitions = 0
    let objectiveTransitions = 0
    for (let index = 0; index < 600; index += 1) {
      const accelerator = index % 2 === 0 ? 0.009 : 0.011
      const result = stepSimulation(state, drive(accelerator), 1 / 120)
      state = result.state
      if (state.vehicleMotionState !== previousMotion) motionTransitions += 1
      if (state.systemObjective !== previousObjective) objectiveTransitions += 1
      previousMotion = state.vehicleMotionState
      previousObjective = state.systemObjective
    }
    expect(motionTransitions).toBeLessThanOrEqual(2)
    expect(objectiveTransitions).toBeLessThanOrEqual(2)
  })

  const frameCases: Array<[string, SimulationState, DriverInputs, number]> = [
    ['engine start', createInitialSimulationState({ batterySoc: 43 }), DEFAULT_DRIVER_INPUTS, 1.5],
    ['charge threshold crossing', createInitialSimulationState({ batterySoc: 59.8, engineState: 'FUELED', engineRpm: 1_550, chargeRequestActive: true }), DEFAULT_DRIVER_INPUTS, 6],
    ['hard braking to zero', createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 60 }), drive(0, 0.8), 7],
    ['reverse', createInitialSimulationState({ batterySoc: 60 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'R', accelerator: 0.4 }, 6],
    ['B mode', createInitialSimulationState({ batterySoc: 72, vehicleSpeedKph: 80 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'B', roadGradePercent: -5 }, 8],
  ]

  it.each(frameCases)('is frame-rate independent for %s', (_name, initialState, inputs, durationSeconds) => {
    const finals = [30, 60, 120].map((hz) => simulate(initialState, inputs, durationSeconds, 1 / hz))
    const speeds = finals.map((result) => result.state.vehicleSpeedMps)
    const socs = finals.map((result) => result.state.batterySoc)
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeLessThan(0.015)
    expect(Math.max(...socs) - Math.min(...socs)).toBeLessThan(0.003)
    expect(new Set(finals.map((result) => result.state.engineState)).size).toBe(1)
    expect(new Set(finals.map((result) => result.state.chargeRequestActive)).size).toBe(1)
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
    runScenario({
      initialState: createInitialSimulationState({ batterySoc: 43 }),
      initialInputs: DEFAULT_DRIVER_INPUTS,
      inputTimeline: [],
      durationSeconds: 20,
      timestepSeconds: 1 / 30,
    })
    const second = run()
    expect(second.state.vehicleSpeedMps).toBeCloseTo(first.state.vehicleSpeedMps, 10)
    expect(second.state.batterySoc).toBeCloseTo(first.state.batterySoc, 10)
  })
})
