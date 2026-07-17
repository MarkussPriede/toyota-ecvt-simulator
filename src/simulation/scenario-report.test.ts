import { describe, expect, it } from 'vitest'
import { createInitialSimulationState } from './engine'
import { runScenario, SCENARIOS } from './scenarios'

describe('scripted demonstration catalogue', () => {
  it('runs every demonstration deterministically with finite, balanced telemetry', () => {
    const report: Record<string, unknown> = {}
    for (const scenario of SCENARIOS) {
      const samples = runScenario({
        initialState: scenario.initialState,
        initialInputs: scenario.initialInputs,
        inputTimeline: scenario.inputTimeline,
        durationSeconds: scenario.durationSeconds,
        timestepSeconds: 0.1,
      })
      const final = samples[samples.length - 1]
      const maximumResidualKw = Math.max(...samples.map((sample) => sample.telemetry.powerBalanceResidualKw))
      const maximumMg2RatioResidualRpm = Math.max(...samples.map((sample) => Math.abs(sample.telemetry.mg2RatioResidualRpm)))
      expect(Number.isFinite(final.state.vehicleSpeedMps)).toBe(true)
      expect(Number.isFinite(final.state.batterySoc)).toBe(true)
      expect(maximumResidualKw).toBeLessThan(1e-8)
      expect(maximumMg2RatioResidualRpm).toBeLessThan(1e-8)
      report[scenario.id] = {
        speedKph: Number(final.telemetry.vehicleSpeedKph.toFixed(2)),
        batterySoc: Number(final.state.batterySoc.toFixed(3)),
        mode: final.telemetry.operatingMode,
        engineState: final.state.engineState,
        maximumResidualKw,
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
      const final = samples[samples.length - 1]
      return { hz, speedMps: final.state.vehicleSpeedMps, batterySoc: final.state.batterySoc }
    })
    report.frameRates = frameRates
    if (import.meta.env.VALIDATION_REPORT === '1') console.log(`VALIDATION_REPORT=${JSON.stringify(report)}`)
  })
})
