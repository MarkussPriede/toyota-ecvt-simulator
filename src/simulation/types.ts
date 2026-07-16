export type DriveSelector = 'P' | 'R' | 'N' | 'D' | 'B'

export type ModeId =
  | 'ready'
  | 'ev-launch'
  | 'gentle-acceleration'
  | 'strong-acceleration'
  | 'cruise'
  | 'stationary-charge'
  | 'regeneration'
  | 'reverse'
  | 'regen-limited'
  | 'neutral'
  | 'coasting'
  | 'warm-up'

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

export type CameraPreset =
  | 'drivetrain'
  | 'planetary'
  | 'mg1'
  | 'mg2'
  | 'differential'
  | 'electrical'

export type FlowId =
  | 'engine-planetary'
  | 'planetary-output'
  | 'output-wheels'
  | 'battery-inverter'
  | 'inverter-mg2'
  | 'mg1-inverter'
  | 'wheels-mg2'
  | 'inverter-battery'

export type FlowKind = 'engine' | 'battery' | 'regen' | 'mg1' | 'mg2'

export interface EnergyFlow {
  id: FlowId
  kind: FlowKind
  powerKw: number
  direction: 1 | -1
}

export interface SimulationInputs {
  accelerator: number
  brake: number
  vehicleSpeed: number
  batterySoc: number
  selector: DriveSelector
  engineWarm: boolean
  automatic: boolean
  scenario: ModeId | null
}

export interface SimulationOutput {
  mode: ModeId
  modeLabel: string
  description: string
  engineRpm: number
  mg1Rpm: number
  mg2Rpm: number
  ringRpm: number
  carrierRpm: number
  wheelRpm: number
  batteryPowerKw: number
  enginePowerKw: number
  mg1PowerKw: number
  mg2PowerKw: number
  regenPowerKw: number
  frictionBrakePowerKw: number
  wheelPowerKw: number
  wheelTorqueNm: number
  mg1LimitActive: boolean
  energyFlows: EnergyFlow[]
}

export interface ScenarioPreset {
  id: string
  label: string
  shortLabel: string
  mode: ModeId
  inputs: Partial<SimulationInputs>
}
