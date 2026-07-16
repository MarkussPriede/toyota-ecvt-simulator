import type { ScenarioPreset } from './types'

export const SCENARIOS: ScenarioPreset[] = [
  { id: 'ev-city', label: 'EV city launch', shortLabel: 'EV launch', mode: 'ev-launch', inputs: { selector: 'D', vehicleSpeed: 8, accelerator: 32, brake: 0, batterySoc: 62, engineWarm: true } },
  { id: 'city-accel', label: 'Normal city acceleration', shortLabel: 'City accel', mode: 'gentle-acceleration', inputs: { selector: 'D', vehicleSpeed: 32, accelerator: 48, brake: 0, batterySoc: 58, engineWarm: true } },
  { id: 'full-power', label: 'Full-power acceleration', shortLabel: 'Full power', mode: 'strong-acceleration', inputs: { selector: 'D', vehicleSpeed: 74, accelerator: 96, brake: 0, batterySoc: 64, engineWarm: true } },
  { id: 'cruise-50', label: '50 km/h cruise', shortLabel: '50 cruise', mode: 'cruise', inputs: { selector: 'D', vehicleSpeed: 50, accelerator: 19, brake: 0, batterySoc: 57, engineWarm: true } },
  { id: 'cruise-90', label: '90 km/h cruise', shortLabel: '90 cruise', mode: 'cruise', inputs: { selector: 'D', vehicleSpeed: 90, accelerator: 25, brake: 0, batterySoc: 56, engineWarm: true } },
  { id: 'coast', label: 'Coasting', shortLabel: 'Coast', mode: 'coasting', inputs: { selector: 'D', vehicleSpeed: 64, accelerator: 0, brake: 0, batterySoc: 55, engineWarm: true } },
  { id: 'regen', label: 'Regenerative braking', shortLabel: 'Regen', mode: 'regeneration', inputs: { selector: 'D', vehicleSpeed: 54, accelerator: 0, brake: 42, batterySoc: 52, engineWarm: true } },
  { id: 'hard-brake', label: 'Hard braking', shortLabel: 'Hard brake', mode: 'regeneration', inputs: { selector: 'D', vehicleSpeed: 72, accelerator: 0, brake: 92, batterySoc: 56, engineWarm: true } },
  { id: 'reverse', label: 'Reverse', shortLabel: 'Reverse', mode: 'reverse', inputs: { selector: 'R', vehicleSpeed: 10, accelerator: 28, brake: 0, batterySoc: 60, engineWarm: true } },
  { id: 'stationary-charge', label: 'Stationary charging', shortLabel: 'Charge', mode: 'stationary-charge', inputs: { selector: 'P', vehicleSpeed: 0, accelerator: 0, brake: 0, batterySoc: 28, engineWarm: true } },
  { id: 'cold-warmup', label: 'Cold-engine warm-up', shortLabel: 'Warm-up', mode: 'warm-up', inputs: { selector: 'P', vehicleSpeed: 0, accelerator: 0, brake: 0, batterySoc: 55, engineWarm: false } },
  { id: 'high-soc', label: 'High battery state of charge', shortLabel: 'High SOC', mode: 'regen-limited', inputs: { selector: 'D', vehicleSpeed: 70, accelerator: 0, brake: 54, batterySoc: 79, engineWarm: true } },
  { id: 'low-soc', label: 'Low battery state of charge', shortLabel: 'Low SOC', mode: 'stationary-charge', inputs: { selector: 'P', vehicleSpeed: 0, accelerator: 0, brake: 0, batterySoc: 22, engineWarm: true } },
  { id: 'b-downhill', label: 'B-mode downhill descent', shortLabel: 'B downhill', mode: 'regen-limited', inputs: { selector: 'B', vehicleSpeed: 82, accelerator: 0, brake: 18, batterySoc: 76, engineWarm: true } },
]

export const scenarioById = (id: string) => SCENARIOS.find((scenario) => scenario.id === id)
