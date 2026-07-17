export type DriveSelector = 'P' | 'R' | 'N' | 'D' | 'B'

export type EngineState = 'OFF' | 'CRANKING' | 'FUELED' | 'SPINNING_UNFUELED' | 'STOPPING'

export type OperatingMode =
  | 'READY'
  | 'PARKED'
  | 'EV_DRIVE'
  | 'REVERSE_EV'
  | 'ENGINE_START'
  | 'ENGINE_DRIVE'
  | 'ENGINE_DRIVE_AND_CHARGE'
  | 'COMBINED_ACCELERATION'
  | 'STATIONARY_CHARGING'
  | 'COASTING'
  | 'REGENERATIVE_BRAKING'
  | 'BLENDED_BRAKING'
  | 'ENGINE_BRAKING'
  | 'NEUTRAL'

export type ComponentId =
  | 'engine'
  | 'mg1'
  | 'mg2'
  | 'sun'
  | 'carrier'
  | 'planets'
  | 'ring'
  | 'reduction'
  | 'differential'
  | 'wheels'
  | 'battery'
  | 'inverter'

export type CameraPreset = 'drivetrain' | 'planetary' | 'mg1' | 'mg2' | 'differential' | 'electrical'
export type VisualMode = 'schematic' | 'cutaway'

export type FlowId =
  | 'engine-planetary'
  | 'planetary-output'
  | 'output-wheels'
  | 'battery-inverter'
  | 'inverter-mg2'
  | 'mg1-inverter'
  | 'inverter-mg1'
  | 'mg1-engine'
  | 'wheels-mg2'
  | 'inverter-battery'
  | 'drivetrain-engine'
  | 'friction-brakes'

export type FlowKind = 'engine' | 'battery' | 'regen' | 'mg1' | 'mg2' | 'loss'

export interface EnergyFlow {
  id: FlowId
  kind: FlowKind
  powerKw: number
  direction: 1 | -1
}

export interface DriverInputs {
  /** Normalized driver request, 0..1. */
  accelerator: number
  /** Normalized driver request, 0..1. */
  brake: number
  selector: DriveSelector
  roadGradePercent: number
}

export interface SimulationState {
  timeSeconds: number
  vehicleSpeedMps: number
  vehiclePositionM: number
  vehicleAccelerationMps2: number
  batterySoc: number
  batteryEnergyKwh: number
  engineState: EngineState
  engineRpm: number
  engineTorqueNm: number
  mg1Rpm: number
  mg1TorqueNm: number
  mg2Rpm: number
  mg2TorqueNm: number
  engineTemperatureC: number
  chargeRequestActive: boolean
  warmupRequestActive: boolean
  operatingMode: OperatingMode
  crankingTimerSeconds: number
  engineOnTimerSeconds: number
  engineOffTimerSeconds: number
  stoppingTimerSeconds: number
  parkLockEngaged: boolean
}

export interface PowerDiagnostics {
  engineMechanicalPowerKw: number
  mg1MechanicalPowerKw: number
  mg1ElectricalPowerKw: number
  mg2MechanicalPowerKw: number
  mg2ElectricalPowerKw: number
  batteryTerminalPowerKw: number
  batteryInternalPowerKw: number
  accessoryPowerKw: number
  protectedStartReservePowerKw: number
  inverterLossKw: number
  motorLossKw: number
  drivetrainLossKw: number
  drivetrainWheelPowerKw: number
  wheelPowerKw: number
  aerodynamicLossKw: number
  rollingResistanceLossKw: number
  roadGradePowerKw: number
  roadLoadPowerKw: number
  regenerativeBrakingKw: number
  frictionBrakeLossKw: number
  enginePumpingLossKw: number
  totalRequestedBrakingKw: number
  electricalBalanceResidualKw: number
  mechanicalBalanceResidualKw: number
  powerBalanceResidualKw: number
  planetaryResidualRpmTeeth: number
  mg2RatioResidualRpm: number
}

export interface SimulationTelemetry extends PowerDiagnostics {
  vehicleSpeedKph: number
  vehicleAccelerationMps2: number
  vehiclePositionM: number
  wheelRpm: number
  ringRpm: number
  carrierRpm: number
  engineRpm: number
  engineTorqueNm: number
  mg1Rpm: number
  mg1TorqueNm: number
  mg2Rpm: number
  mg2TorqueNm: number
  wheelTorqueNm: number
  batterySoc: number
  engineTemperatureC: number
  chargeRequestActive: boolean
  socTargetPercent: number
  engineState: EngineState
  operatingMode: OperatingMode
  modeLabel: string
  description: string
  mg1LimitActive: boolean
  energyFlows: EnergyFlow[]
}

export interface SimulationStepResult {
  state: SimulationState
  telemetry: SimulationTelemetry
  diagnostics: PowerDiagnostics
}

export interface TimelinePoint {
  atSeconds: number
  inputs: Partial<DriverInputs>
  camera?: CameraPreset
  component?: ComponentId
  explanation?: string
}

export interface ScenarioDefinition {
  id: string
  label: string
  shortLabel: string
  initialState: Partial<SimulationState> & { batterySoc: number; vehicleSpeedMps: number }
  initialInputs: DriverInputs
  inputTimeline: TimelinePoint[]
  durationSeconds: number
  cameraSequence: TimelinePoint[]
  highlightedComponents: ComponentId[]
  explanationSteps: string[]
  completionCondition: string
}

export interface ScenarioRunOptions {
  initialState: SimulationState | (Partial<SimulationState> & { batterySoc: number; vehicleSpeedMps: number })
  initialInputs?: DriverInputs
  inputTimeline: TimelinePoint[]
  durationSeconds: number
  timestepSeconds: number
}

export interface ScenarioSample extends SimulationStepResult {
  inputs: DriverInputs
}
