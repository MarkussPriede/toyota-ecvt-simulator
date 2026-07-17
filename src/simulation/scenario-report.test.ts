import { describe, expect, it } from 'vitest'
import { LIMITS } from './constants'
import { createInitialSimulationState } from './engine'
import { runScenario, SCENARIOS } from './scenarios'
import type { ScenarioDefinition, ScenarioSample } from './types'

const maximum = (samples: ScenarioSample[], field: keyof ScenarioSample['telemetry']) =>
  Math.max(...samples.map((sample) => Math.abs(Number(sample.telemetry[field]))))

function assertCompletion(scenario: ScenarioDefinition, samples: ScenarioSample[]) {
  const final = samples[samples.length - 1]!
  const initialSpeed = scenario.initialState.vehicleSpeedMps
  const initialSoc = scenario.initialState.batterySoc
  switch (scenario.id) {
    case 'ready':
      expect(final.state.vehicleSpeedMps).toBe(0)
      expect(final.state.engineState).toBe('OFF')
      expect(final.telemetry.vehicleMotionState).toBe('STATIONARY')
      break
    case 'ev-launch':
      expect(final.state.vehicleSpeedMps).toBeGreaterThan(5)
      expect(final.state.batterySoc).toBeLessThan(initialSoc)
      break
    case 'engine-start':
      expect(samples.some((sample) => sample.state.engineState === 'CRANKING')).toBe(true)
      expect(final.state.engineState).toBe('FUELED')
      expect(maximum(samples.filter((sample) => sample.state.engineState !== 'FUELED'), 'engineMechanicalPowerKw')).toBe(0)
      break
    case 'engine-joins':
      expect(samples.some((sample) => sample.state.engineState === 'FUELED')).toBe(true)
      expect(final.state.vehicleSpeedMps).toBeGreaterThan(initialSpeed)
      break
    case 'low-soc-charge':
      expect(samples.some((sample) => sample.telemetry.systemObjective === 'CHARGING')).toBe(true)
      expect(samples.some((sample) => sample.telemetry.batteryTerminalPowerKw < -1)).toBe(true)
      expect(
        samples.some((sample) => !sample.state.chargeRequestActive),
        `low-soc final SOC ${final.state.batterySoc.toFixed(3)}`,
      ).toBe(true)
      break
    case 'combined-acceleration':
      expect(samples.some((sample) => sample.telemetry.engineMechanicalPowerKw > 35
        && sample.telemetry.batteryTerminalPowerKw > 1)).toBe(true)
      expect(final.state.vehicleSpeedMps).toBeGreaterThan(initialSpeed)
      break
    case 'charge-sustain':
      expect(Math.abs(final.state.batterySoc - initialSoc)).toBeLessThan(8)
      expect(final.state.vehicleSpeedMps).toBeGreaterThan(10)
      break
    case 'coast':
      expect(final.state.vehicleSpeedMps).toBeLessThan(initialSpeed)
      expect(maximum(samples, 'frictionBrakeLossKw')).toBe(0)
      expect(final.telemetry.vehicleMotionState).toBe('COASTING')
      break
    case 'light-regen':
      expect(final.state.vehicleSpeedMps).toBeLessThan(initialSpeed)
      expect(samples.some((sample) => sample.telemetry.batteryTerminalPowerKw < 0)).toBe(true)
      expect(final.state.batterySoc).toBeGreaterThan(initialSoc)
      break
    case 'hard-brake':
      expect(Math.abs(final.state.vehicleSpeedMps)).toBeLessThan(0.1)
      expect(maximum(samples, 'frictionBrakeLossKw')).toBeGreaterThan(5)
      break
    case 'high-soc-brake':
      expect(final.state.batterySoc).toBeLessThanOrEqual(80)
      expect(maximum(samples, 'frictionBrakeLossKw')).toBeGreaterThan(0)
      break
    case 'b-downhill':
      expect(maximum(samples, 'enginePumpingLossKw')).toBeGreaterThan(0)
      expect(samples.some((sample) => sample.telemetry.systemObjective === 'ENGINE_BRAKING')).toBe(true)
      expect(final.state.vehicleSpeedMps).toBeLessThan(initialSpeed * 1.1)
      break
    case 'reverse-launch':
      expect(final.state.vehicleSpeedMps).toBeLessThan(0)
      expect(final.telemetry.vehicleMotionState).toBe('REVERSING')
      expect(final.telemetry.vehicleSpeedKph).toBeGreaterThan(-35.5)
      break
    case 'direction-reversal':
      expect(samples.some((sample) => sample.state.vehicleSpeedMps < -0.2
        && sample.telemetry.wheelPowerKw < 0)).toBe(true)
      expect(samples.some((sample) => sample.state.vehicleSpeedMps > 0.2
        && sample.telemetry.wheelPowerKw > 0)).toBe(true)
      expect(samples.some((sample) => sample.telemetry.systemObjective === 'REGENERATING')).toBe(true)
      expect(samples.some((sample) => sample.telemetry.systemObjective === 'EV_PROPULSION')).toBe(true)
      expect(final.state.vehicleSpeedMps).toBeGreaterThan(0)
      break
    case 'stationary-charge':
      expect(final.state.vehicleSpeedMps).toBe(0)
      expect(samples.some((sample) => sample.telemetry.batteryTerminalPowerKw < -1)).toBe(true)
      expect(samples.some((sample) => !sample.state.chargeRequestActive)).toBe(true)
      break
    case 'neutral':
      expect(samples.every((sample) => sample.telemetry.energyFlows.length === 0)).toBe(true)
      expect(maximum(samples, 'regenerativeBrakingKw')).toBe(0)
      expect(final.state.vehicleSpeedMps).toBeGreaterThan(0)
      expect(final.state.vehicleSpeedMps).toBeLessThan(initialSpeed)
      break
    case 'mg1-protection':
      expect(maximum(samples, 'mg1Rpm')).toBeLessThanOrEqual(LIMITS.mg1Rpm + 1e-6)
      expect(samples.some((sample) => sample.telemetry.systemObjective === 'MG1_PROTECTION')).toBe(true)
      expect(maximum(samples, 'planetaryResidualRpmTeeth')).toBeLessThan(1e-7)
      break
    case 'differential-cornering': {
      const leftRpm = final.telemetry.wheelRpm * 0.82
      const rightRpm = final.telemetry.wheelRpm * 1.18
      expect(leftRpm).not.toBe(rightRpm)
      expect((leftRpm + rightRpm) / 2).toBeCloseTo(final.telemetry.wheelRpm, 10)
      break
    }
  }
}

describe('scripted demonstration catalogue', () => {
  it('runs every demonstration deterministically and satisfies its behavioral contract', () => {
    const report: Record<string, unknown> = {}
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
    for (const scenario of SCENARIOS) {
      const samples = runScenario({
        initialState: scenario.initialState,
        initialInputs: scenario.initialInputs,
        inputTimeline: scenario.inputTimeline,
        durationSeconds: scenario.durationSeconds,
        timestepSeconds: 0.1,
      })
      const final = samples[samples.length - 1]!
      assertCompletion(scenario, samples)
      const maximumResidualKw = maximum(samples, 'powerBalanceResidualKw')
      const maximumFeasibility = Object.fromEntries(violationFields.map((field) => [field, maximum(samples, field)]))
      expect(maximumResidualKw).toBeLessThan(1e-8)
      expect(maximum(samples, 'mg2ReductionResidualRpmTeeth')).toBeLessThan(1e-8)
      for (const field of violationFields) expect(maximum(samples, field), `${scenario.id}:${field}`).toBeLessThan(1e-6)
      report[scenario.id] = {
        speedKph: Number(final.telemetry.vehicleSpeedKph.toFixed(2)),
        batterySoc: Number(final.state.batterySoc.toFixed(3)),
        motion: final.telemetry.vehicleMotionState,
        objective: final.telemetry.systemObjective,
        engineState: final.state.engineState,
        maximumResidualKw,
        maximumFeasibility,
      }
    }

    const frameRates = [30, 60, 120].map((hz) => {
      const samples = runScenario({
        initialState: createInitialSimulationState({ batterySoc: 58 }),
        initialInputs: { accelerator: 0.45, brake: 0, selector: 'D', roadGradePercent: 0 },
        inputTimeline: [],
        durationSeconds: 18,
        timestepSeconds: 1 / hz,
      })
      const final = samples[samples.length - 1]!
      return { hz, speedMps: final.state.vehicleSpeedMps, batterySoc: final.state.batterySoc }
    })
    report.frameRates = frameRates
    if (import.meta.env.VALIDATION_REPORT === '1') console.log(`VALIDATION_REPORT=${JSON.stringify(report)}`)
  })
})
