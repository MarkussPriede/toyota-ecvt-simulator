export const POWER_SPLIT = {
  // Educational approximation. The ratio is representative of Toyota's compound
  // power-split behaviour; the visual model simplifies the real tooth geometry.
  ringTeeth: 78,
  sunTeeth: 30,
  planetTeeth: 24,
} as const

export const LIMITS = {
  engineRpm: 5_200,
  mg1Rpm: 10_000,
  mg2Rpm: 13_500,
  vehicleSpeedKph: 180,
  batterySocMin: 20,
  batterySocMax: 80,
  enginePowerKw: 73,
  mg2PowerKw: 60,
  systemPowerKw: 100,
  regenPowerKw: 32,
  wheelTorqueNm: 1_600,
} as const

export const DRIVETRAIN = {
  wheelRadiusM: 0.30,
  finalDriveRatio: 3.267,
  mg2ReductionRatio: 2.636,
  propulsionEfficiency: 0.96,
  regenerationEfficiency: 0.88,
  usableBatteryKwh: 1.1,
} as const

export const VISUAL_RPM_SCALE = 0.00016
