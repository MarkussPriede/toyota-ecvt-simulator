import { LIMITS, POWER_SPLIT } from './constants'

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))

/** Nr*wr + Ns*ws = (Nr + Ns)*wc. Signed RPM is retained. */
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

export function carrierRangeForMg1(ringRpm: number) {
  const { ringTeeth: nr, sunTeeth: ns } = POWER_SPLIT
  return {
    minimumRpm: Math.max(0, (nr * ringRpm - ns * LIMITS.mg1Rpm) / (nr + ns)),
    maximumRpm: Math.min(LIMITS.engineRpm, (nr * ringRpm + ns * LIMITS.mg1Rpm) / (nr + ns)),
  }
}

export function resolveCarrierRpm(ringRpm: number, requestedCarrierRpm: number) {
  const range = carrierRangeForMg1(ringRpm)
  const carrierRpm = clamp(requestedCarrierRpm, range.minimumRpm, Math.max(range.minimumRpm, range.maximumRpm))
  return {
    carrierRpm,
    mg1Rpm: solveSunRpm(ringRpm, carrierRpm),
    limitActive: Math.abs(carrierRpm - requestedCarrierRpm) > 0.5,
  }
}

export function planetaryResidual(ringRpm: number, sunRpm: number, carrierRpm: number) {
  const { ringTeeth: nr, sunTeeth: ns } = POWER_SPLIT
  return nr * ringRpm + ns * sunRpm - (nr + ns) * carrierRpm
}
