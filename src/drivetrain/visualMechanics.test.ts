import { describe, expect, it } from 'vitest'
import { MG2_REDUCTION, POWER_SPLIT } from '../simulation/constants'
import { fixedCarrierPlanetRpm, powerSplitPlanetRelativeRpm, reductionRingRpm, steppedRotation } from './visualMechanics'

describe('teaching-view mechanism kinematics', () => {
  it('spins power-split planets relative to the orbiting carrier', () => {
    const sunRpm = -2_400
    const carrierRpm = 1_200
    const planetRelativeRpm = powerSplitPlanetRelativeRpm(sunRpm, carrierRpm)
    expect((sunRpm - carrierRpm) * POWER_SPLIT.sunTeeth + planetRelativeRpm * POWER_SPLIT.planetTeeth).toBeCloseTo(0, 10)
  })

  it('animates the fixed-carrier MG2 ring with the required opposite sign', () => {
    const sunRpm = -5_800
    const ringRpm = reductionRingRpm(sunRpm)
    expect(sunRpm * MG2_REDUCTION.sunTeeth + ringRpm * MG2_REDUCTION.ringTeeth).toBeCloseTo(0, 10)
    expect(ringRpm).toBeGreaterThan(0)
  })

  it('spins fixed-carrier planets on stationary pins', () => {
    const sunRpm = 3_000
    const planetRpm = fixedCarrierPlanetRpm(sunRpm)
    expect(sunRpm * MG2_REDUCTION.sunTeeth + planetRpm * MG2_REDUCTION.planetTeeth).toBeCloseTo(0, 10)
  })

  it('advances every paused member through the same visual-time increment', () => {
    const slow = steppedRotation(900, 0, 1)
    const fast = steppedRotation(1_800, 0, 1)
    expect(fast / slow).toBeCloseTo(2, 12)
    expect(steppedRotation(-900, 0, 1)).toBeCloseTo(-slow, 12)
    expect(steppedRotation(0, 0, 1)).toBe(0)
  })

  it('preserves both planetary equations during proportional step-through', () => {
    const sunRpm = -2_400
    const carrierRpm = 1_200
    const ringRpm = ((POWER_SPLIT.ringTeeth + POWER_SPLIT.sunTeeth) * carrierRpm
      - POWER_SPLIT.sunTeeth * sunRpm) / POWER_SPLIT.ringTeeth
    const planetRpm = powerSplitPlanetRelativeRpm(sunRpm, carrierRpm)
    const sunStep = steppedRotation(sunRpm, 0, 1)
    const carrierStep = steppedRotation(carrierRpm, 0, 1)
    const ringStep = steppedRotation(ringRpm, 0, 1)
    const planetStep = steppedRotation(planetRpm, 0, 1)
    expect(POWER_SPLIT.ringTeeth * ringStep + POWER_SPLIT.sunTeeth * sunStep)
      .toBeCloseTo((POWER_SPLIT.ringTeeth + POWER_SPLIT.sunTeeth) * carrierStep, 10)
    expect((sunStep - carrierStep) * POWER_SPLIT.sunTeeth + planetStep * POWER_SPLIT.planetTeeth)
      .toBeCloseTo(0, 10)

    const reductionSunStep = steppedRotation(3_000, 0, 1)
    const reductionRingStep = steppedRotation(reductionRingRpm(3_000), 0, 1)
    const reductionPlanetStep = steppedRotation(fixedCarrierPlanetRpm(3_000), 0, 1)
    expect(reductionSunStep * MG2_REDUCTION.sunTeeth + reductionRingStep * MG2_REDUCTION.ringTeeth)
      .toBeCloseTo(0, 10)
    expect(reductionSunStep * MG2_REDUCTION.sunTeeth + reductionPlanetStep * MG2_REDUCTION.planetTeeth)
      .toBeCloseTo(0, 10)
  })
})
