import { LIMITS, POWER_SPLIT } from './constants'

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))

/** Nr·wr + Ns·ws = (Nr + Ns)·wc */
export function solveSunRpm(ringRpm: number, carrierRpm: number) {
  const { ringTeeth: nr, sunTeeth: ns } = POWER_SPLIT
  return ((nr + ns) * carrierRpm - nr * ringRpm) / ns
}

export function solveRingRpm(sunRpm: number, carrierRpm: number) {
  const { ringTeeth: nr, sunTeeth: ns } = POWER_SPLIT
  return ((nr + ns) * carrierRpm - ns * sunRpm) / nr
}

export function solveCarrierRpm(ringRpm: number, sunRpm: number) {
  const { ringTeeth: nr, sunTeeth: ns } = POWER_SPLIT
  return (nr * ringRpm + ns * sunRpm) / (nr + ns)
}

export function clampedRpms(engineRpm: number, mg1Rpm: number, mg2Rpm: number) {
  return {
    engineRpm: clamp(engineRpm, 0, LIMITS.engineRpm),
    mg1Rpm: clamp(mg1Rpm, -LIMITS.mg1Rpm, LIMITS.mg1Rpm),
    mg2Rpm: clamp(mg2Rpm, -LIMITS.mg2Rpm, LIMITS.mg2Rpm),
  }
}
