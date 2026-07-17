import { MG2_REDUCTION, POWER_SPLIT, VISUAL_RPM_SCALE } from '../simulation/constants'

/** One paused step advances this much visual time, without advancing simulation time. */
export const MECHANISM_STEP_SECONDS = 0.25

export function powerSplitPlanetRelativeRpm(sunRpm: number, carrierRpm: number) {
  return -(sunRpm - carrierRpm) * POWER_SPLIT.sunTeeth / POWER_SPLIT.planetTeeth
}

export function reductionRingRpm(sunRpm: number) {
  return -sunRpm * MG2_REDUCTION.sunTeeth / MG2_REDUCTION.ringTeeth
}

export function fixedCarrierPlanetRpm(sunRpm: number) {
  return -sunRpm * MG2_REDUCTION.sunTeeth / MG2_REDUCTION.planetTeeth
}

export function steppedRotation(rpm: number, continuousScale: number, stepCount: number) {
  return rpm * (continuousScale + VISUAL_RPM_SCALE * MECHANISM_STEP_SECONDS * stepCount)
}
