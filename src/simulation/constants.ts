export const POWER_SPLIT = {
  // Tooth counts are geometrically consistent: Nr = Ns + 2Np.
  ringTeeth: 78,
  sunTeeth: 30,
  planetTeeth: 24,
} as const

export const MG2_REDUCTION = {
  // Educational P410-style compound member: MG2 sun, fixed carrier, output ring.
  // 58 / 22 = 2.636:1 and Nr = Ns + 2Np.
  ringTeeth: 58,
  sunTeeth: 22,
  planetTeeth: 18,
} as const

export const BATTERY = {
  hardLowerSoc: 40,
  chargeRequestSoc: 45,
  preferredTargetSoc: 57,
  chargeClearSoc: 60,
  regenTaperSoc: 70,
  hardUpperSoc: 80,
  nominalCapacityKwh: 1.31,
  maxChargeKw: 24,
  maxDischargeKw: 32,
  chargeEfficiency: 0.91,
  dischargeEfficiency: 0.94,
  accessoryLoadKw: 0.45,
  protectedReserveCapacityKwh: 0.08,
  protectedReserveMaxPowerKw: 10,
} as const

export const VEHICLE = {
  massKg: 1_475,
  wheelRadiusM: 0.30,
  dragCoefficient: 0.25,
  frontalAreaM2: 2.20,
  airDensityKgM3: 1.225,
  rollingResistanceCoefficient: 0.0105,
  gravityMps2: 9.80665,
  maxTireForceN: 6_200,
  maxBrakeForceN: 10_500,
} as const

export const DRIVETRAIN = {
  finalDriveRatio: 3.267,
  mg2ReductionRatio: MG2_REDUCTION.ringTeeth / MG2_REDUCTION.sunTeeth,
  mechanicalEfficiency: 0.955,
  motorEfficiency: 0.93,
  inverterEfficiency: 0.975,
} as const

export const LIMITS = {
  engineRpm: 5_200,
  engineTorqueNm: 142,
  enginePowerKw: 73,
  mg1Rpm: 10_000,
  mg1PowerKw: 42,
  mg1TorqueNm: 55,
  mg2Rpm: 13_500,
  mg2TorqueNm: 207,
  mg2PowerKw: 60,
  systemPowerKw: 100,
  regenPowerKw: 32,
  inverterThroughputKw: 85,
} as const

export const CONTROL = {
  fixedSubstepSeconds: 1 / 120,
  engineCrankSeconds: 0.75,
  engineStopSeconds: 0.45,
  minimumEngineOnSeconds: 4,
  minimumEngineOffSeconds: 2,
  engineRpmRatePerSecond: 1_800,
  engineTorqueRatePerSecond: 260,
  engineRelightRpm: 700,
  classificationMinimumSeconds: 0.3,
  warmupStartC: 50,
  warmupClearC: 58,
  ambientTemperatureC: 20,
} as const

export const maxVehicleSpeedMps =
  (LIMITS.mg2Rpm / (DRIVETRAIN.finalDriveRatio * DRIVETRAIN.mg2ReductionRatio))
  * (2 * Math.PI * VEHICLE.wheelRadiusM) / 60

export const VISUAL_RPM_SCALE = 0.00016
