import { describe, expect, it } from 'vitest'
import { DEFAULT_DRIVER_INPUTS, createInitialSimulationState, stepSimulation } from './engine'
import type { DriverInputs, SimulationState, SimulationStepResult } from './types'

const TWO_PI = Math.PI * 2

function trace(state: SimulationState, inputs: DriverInputs, durationSeconds: number, timestepSeconds = 1 / 60) {
  const samples: SimulationStepResult[] = []
  let current = state
  for (let elapsed = 0; elapsed < durationSeconds - 1e-9; elapsed += timestepSeconds) {
    const result = stepSimulation(current, inputs, Math.min(timestepSeconds, durationSeconds - elapsed))
    samples.push(result)
    current = result.state
  }
  return samples
}

const finalOf = (samples: SimulationStepResult[]) => samples[samples.length - 1]!
const maximum = (samples: SimulationStepResult[], getter: (sample: SimulationStepResult) => number) =>
  Math.max(...samples.map((sample) => Math.abs(getter(sample))))

function summary(samples: SimulationStepResult[]) {
  const final = finalOf(samples)
  return {
    speedKph: final.telemetry.vehicleSpeedKph,
    batterySoc: final.state.batterySoc,
    engineTemperatureC: final.state.engineTemperatureC,
    engineState: final.state.engineState,
    motion: final.telemetry.vehicleMotionState,
    objective: final.telemetry.systemObjective,
    batteryPowerKw: final.telemetry.batteryTerminalPowerKw,
    enginePowerKw: final.telemetry.engineMechanicalPowerKw,
    maximumFrictionKw: maximum(samples, (sample) => sample.telemetry.frictionBrakeLossKw),
  }
}

describe('Phase 1 numerical acceptance report', () => {
  it('records controller, feasibility, balance, and frame-rate evidence', () => {
    const heldInDrive: DriverInputs = { ...DEFAULT_DRIVER_INPUTS, selector: 'D', brake: 0.45 }
    const coastInDrive: DriverInputs = { ...DEFAULT_DRIVER_INPUTS, selector: 'D' }
    const reverse: DriverInputs = { ...DEFAULT_DRIVER_INPUTS, selector: 'R', accelerator: 0.35 }
    const neutral: DriverInputs = { ...DEFAULT_DRIVER_INPUTS, selector: 'N' }
    const cases = {
      stationaryLowSocBrakeHold: trace(createInitialSimulationState({ batterySoc: 43, engineTemperatureC: 82 }), heldInDrive, 4),
      stationaryColdBrakeHold: trace(createInitialSimulationState({ batterySoc: 58, engineTemperatureC: 25 }), heldInDrive, 8),
      coastingEngineCharge: trace(createInitialSimulationState({ vehicleSpeedKph: 55, batterySoc: 43 }), coastInDrive, 4),
      reverseLowSoc: trace(createInitialSimulationState({ batterySoc: 43 }), reverse, 6),
      reverseCold: trace(createInitialSimulationState({ batterySoc: 58, engineTemperatureC: 25 }), reverse, 6),
      neutralWhileReversing: trace(createInitialSimulationState({ vehicleSpeedKph: -30, batterySoc: 58 }), neutral, 3),
      neutralUphillRollback: trace(createInitialSimulationState({ batterySoc: 58 }), { ...neutral, roadGradePercent: 6 }, 3),
      hardBraking: trace(createInitialSimulationState({ vehicleSpeedKph: 72, batterySoc: 55 }), { ...coastInDrive, brake: 0.88 }, 8),
      bMode: trace(createInitialSimulationState({ vehicleSpeedKph: 80, batterySoc: 72 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'B', roadGradePercent: -5 }, 8),
    }

    const relightStart = createInitialSimulationState({
      vehicleSpeedKph: 50,
      batterySoc: 43,
      engineState: 'SPINNING_UNFUELED',
      engineRpm: 1_500,
    })
    const relight = stepSimulation(relightStart, { ...coastInDrive, accelerator: 0.2 }, 1 / 120)
    const allSamples = Object.values(cases).flat()
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
    const feasibility = Object.fromEntries(violationFields.map((field) => [
      field,
      maximum(allSamples, (sample) => sample.telemetry[field]),
    ]))
    const pEqualsTOmegaResidualKw = maximum(allSamples, (sample) => Math.max(
      Math.abs(sample.telemetry.engineMechanicalPowerKw
        - sample.telemetry.engineTorqueNm * sample.telemetry.engineRpm * TWO_PI / 60 / 1_000),
      Math.abs(sample.telemetry.mg1MechanicalPowerKw
        - sample.telemetry.mg1TorqueNm * sample.telemetry.mg1Rpm * TWO_PI / 60 / 1_000),
      Math.abs(sample.telemetry.mg2MechanicalPowerKw
        - sample.telemetry.mg2TorqueNm * sample.telemetry.mg2Rpm * TWO_PI / 60 / 1_000),
    ))

    const frameCases: Record<string, [SimulationState, DriverInputs, number]> = {
      engineStart: [createInitialSimulationState({ batterySoc: 43 }), DEFAULT_DRIVER_INPUTS, 1.5],
      chargeThreshold: [createInitialSimulationState({ batterySoc: 59.8, engineState: 'FUELED', engineRpm: 1_550, chargeRequestActive: true }), DEFAULT_DRIVER_INPUTS, 6],
      brakingToZero: [createInitialSimulationState({ batterySoc: 55, vehicleSpeedKph: 60 }), { ...coastInDrive, brake: 0.8 }, 7],
      reverse: [createInitialSimulationState({ batterySoc: 60 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'R', accelerator: 0.4 }, 6],
      bMode: [createInitialSimulationState({ batterySoc: 72, vehicleSpeedKph: 80 }), { ...DEFAULT_DRIVER_INPUTS, selector: 'B', roadGradePercent: -5 }, 8],
    }
    const frameRates = Object.fromEntries(Object.entries(frameCases).map(([name, [state, inputs, duration]]) => {
      const finals = [30, 60, 120].map((hz) => ({ hz, result: finalOf(trace(state, inputs, duration, 1 / hz)) }))
      return [name, {
        finals: finals.map(({ hz, result }) => ({
          hz,
          speedMps: result.state.vehicleSpeedMps,
          batterySoc: result.state.batterySoc,
          engineState: result.state.engineState,
          chargeRequestActive: result.state.chargeRequestActive,
        })),
        maximumSpeedDeltaMps: Math.max(...finals.map(({ result }) => result.state.vehicleSpeedMps))
          - Math.min(...finals.map(({ result }) => result.state.vehicleSpeedMps)),
        maximumSocDeltaPercent: Math.max(...finals.map(({ result }) => result.state.batterySoc))
          - Math.min(...finals.map(({ result }) => result.state.batterySoc)),
      }]
    }))

    const report = {
      scenarios: Object.fromEntries(Object.entries(cases).map(([name, samples]) => [name, summary(samples)])),
      relight: {
        initialEngineState: relightStart.engineState,
        finalEngineState: relight.state.engineState,
        crankingTimerSeconds: relight.state.crankingTimerSeconds,
      },
      maximumFeasibilityViolations: feasibility,
      maximumElectricalResidualKw: maximum(allSamples, (sample) => sample.telemetry.electricalBalanceResidualKw),
      maximumMechanicalResidualKw: maximum(allSamples, (sample) => sample.telemetry.mechanicalBalanceResidualKw),
      maximumPEqualsTOmegaResidualKw: pEqualsTOmegaResidualKw,
      maximumMg2ReductionResidualRpmTeeth: maximum(allSamples, (sample) => sample.telemetry.mg2ReductionResidualRpmTeeth),
      frameRates,
    }

    expect(Object.values(feasibility).every((value) => value <= 1e-6)).toBe(true)
    expect(report.maximumElectricalResidualKw).toBeLessThan(1e-8)
    expect(report.maximumMechanicalResidualKw).toBeLessThan(1e-8)
    expect(report.maximumPEqualsTOmegaResidualKw).toBeLessThan(1e-8)
    expect(report.maximumMg2ReductionResidualRpmTeeth).toBeLessThan(1e-8)
    if (import.meta.env.VALIDATION_REPORT === '1') console.log(`PHASE1_REPORT=${JSON.stringify(report)}`)
  })
})
