import { MG2_REDUCTION, POWER_SPLIT } from '../simulation/constants'

export const MECHANISM_STEP_RADIANS = Math.PI / 18

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
  return rpm * continuousScale + Math.sign(rpm) * MECHANISM_STEP_RADIANS * stepCount
}
