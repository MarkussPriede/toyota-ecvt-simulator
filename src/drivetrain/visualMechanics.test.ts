import { describe, expect, it } from 'vitest'
import { MG2_REDUCTION, POWER_SPLIT } from '../simulation/constants'
import { fixedCarrierPlanetRpm, MECHANISM_STEP_RADIANS, powerSplitPlanetRelativeRpm, reductionRingRpm, steppedRotation } from './visualMechanics'

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

  it('makes a paused visual step signed without advancing simulated time', () => {
    expect(steppedRotation(900, 0, 1)).toBeCloseTo(MECHANISM_STEP_RADIANS, 12)
    expect(steppedRotation(-900, 0, 1)).toBeCloseTo(-MECHANISM_STEP_RADIANS, 12)
    expect(steppedRotation(0, 0, 1)).toBe(0)
  })
})
