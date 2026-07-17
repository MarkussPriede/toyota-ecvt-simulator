import { BATTERY } from './constants'
import { createInitialSimulationState, DEFAULT_DRIVER_INPUTS, stepSimulation } from './engine'
import type { DriverInputs, ScenarioDefinition, ScenarioRunOptions, ScenarioSample, SimulationState, TimelinePoint } from './types'

const kph = (value: number) => value / 3.6
const warm = 82

function definition(
  id: string,
  label: string,
  shortLabel: string,
  speedKph: number,
  batterySoc: number,
  inputs: DriverInputs,
  durationSeconds: number,
  inputTimeline: TimelinePoint[],
  highlightedComponents: ScenarioDefinition['highlightedComponents'],
  explanationSteps: string[],
  completionCondition: string,
  engineTemperatureC = warm,
): ScenarioDefinition {
  const cameraSequence = inputTimeline.filter((point) => point.camera || point.component || point.explanation)
  return {
    id,
    label,
    shortLabel,
    initialState: { vehicleSpeedMps: kph(speedKph), batterySoc, engineTemperatureC },
    initialInputs: inputs,
    inputTimeline,
    durationSeconds,
    cameraSequence,
    highlightedComponents,
    explanationSteps,
    completionCondition,
  }
}

export const SCENARIOS: ScenarioDefinition[] = [
  definition('ready', 'READY system state', 'READY', 0, 58, { ...DEFAULT_DRIVER_INPUTS, selector: 'P' }, 8,
    [{ atSeconds: 0, inputs: {}, camera: 'drivetrain', component: 'battery', explanation: 'READY does not mean the petrol engine is running.' }],
    ['battery', 'inverter'], ['The contactors are closed and the car can respond immediately.', 'Accessories create a small, explicit electrical load.'], 'Vehicle remains stationary with the engine off.'),
  definition('ev-launch', 'EV launch from zero', 'EV launch', 0, 60, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.4 }, 10,
    [{ atSeconds: 0, inputs: {}, camera: 'mg2', component: 'mg2', explanation: 'MG2 torque exists even when wheel power is initially zero.' }],
    ['battery', 'inverter', 'mg2', 'reduction', 'wheels'], ['Battery energy becomes MG2 torque.', 'Speed rises from force integration rather than a speed slider.'], 'Vehicle accelerates and SOC falls while the engine remains off.'),
  definition('engine-start', 'MG1 starts the engine', 'Engine start', 0, 44, { ...DEFAULT_DRIVER_INPUTS, selector: 'P' }, 4,
    [{ atSeconds: 0, inputs: {}, camera: 'mg1', component: 'mg1', explanation: 'MG1 cranks for 0.75 seconds; combustion torque is still zero.' }],
    ['battery', 'inverter', 'mg1', 'engine'], ['Battery power motors MG1.', 'The state machine changes CRANKING to FUELED after a bounded transient.'], 'The engine reaches FUELED without an unbounded cranking state.'),
  definition('engine-joins', 'Engine joins during acceleration', 'Engine joins', 18, 58, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.76 }, 12,
    [{ atSeconds: 0, inputs: {}, camera: 'planetary', component: 'carrier' }, { atSeconds: 7, inputs: { accelerator: 0.35 }, component: 'ring' }],
    ['engine', 'carrier', 'mg1', 'ring', 'mg2'], ['MG1 starts the engine.', 'Carrier speed rises smoothly while ring speed remains tied to the road.'], 'Engine power joins MG2 without a speed discontinuity.'),
  definition('low-soc-charge', 'Driving while charging low SOC', 'Drive + charge', 50, 43, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.25 }, 130,
    [{ atSeconds: 0, inputs: {}, camera: 'drivetrain', component: 'mg1', explanation: 'The latched charge request adds power above road demand.' }],
    ['engine', 'mg1', 'inverter', 'battery', 'wheels'], ['Engine torque serves the output ring.', 'Surplus planetary power makes MG1 generate.', 'Charging tapers after the preferred target and clears at 60%.'], 'SOC reaches the clearing threshold without rapid mode oscillation.'),
  definition('combined-acceleration', 'Strong combined acceleration', 'Full power', 70, 50, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.95 }, 12,
    [{ atSeconds: 0, inputs: {}, camera: 'electrical', component: 'inverter' }],
    ['engine', 'mg1', 'inverter', 'battery', 'mg2', 'wheels'], ['The engine runs near its educational curve.', 'MG1 generation and battery discharge can feed MG2 simultaneously.'], 'Speed increases and the controller does not impose a large charging load.'),
  definition('charge-sustain', 'Charge-sustaining cruise', 'Charge sustain', 75, 55, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.2 }, 45,
    [{ atSeconds: 0, inputs: {}, camera: 'drivetrain', component: 'engine' }, { atSeconds: 15, inputs: { accelerator: 0.16 } }],
    ['engine', 'mg1', 'ring', 'battery'], ['The controller balances small electrical transfers around the target range.'], 'Speed and SOC remain within a stable cruise band.'),
  definition('coast', 'Glide / coast', 'Coast', 60, 55, { ...DEFAULT_DRIVER_INPUTS, selector: 'D' }, 20,
    [{ atSeconds: 0, inputs: {}, camera: 'differential', component: 'wheels' }],
    ['wheels'], ['Road load slows the car.', 'Hydraulic braking remains zero because the driver did not request braking.'], 'Speed falls naturally with zero friction-brake command.'),
  definition('light-regen', 'Light regenerative braking', 'Light regen', 60, 55, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', brake: 0.26 }, 10,
    [{ atSeconds: 0, inputs: {}, camera: 'mg2', component: 'mg2' }],
    ['wheels', 'differential', 'mg2', 'inverter', 'battery'], ['MG2 absorbs wheel power and generates.', 'Battery power is negative under the displayed sign convention.'], 'Vehicle slows and SOC rises.'),
  definition('hard-brake', 'Hard blended braking', 'Hard brake', 72, 55, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', brake: 0.88 }, 8,
    [{ atSeconds: 0, inputs: {}, camera: 'differential', component: 'wheels' }],
    ['wheels', 'mg2', 'battery'], ['Regeneration reaches a limit.', 'Friction brakes provide the unmet stopping force.'], 'The car stops with regeneration fading near walking speed.'),
  definition('high-soc-brake', 'High-SOC regeneration limit', 'High SOC brake', 65, 78.5, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', brake: 0.55 }, 10,
    [{ atSeconds: 0, inputs: {}, camera: 'electrical', component: 'battery' }],
    ['battery', 'mg2', 'wheels'], ['Charge acceptance tapers toward the hard upper boundary.', 'Friction braking replaces rejected regeneration.'], 'SOC stays at or below 80%.'),
  definition('b-downhill', 'B-mode downhill engine braking', 'B downhill', 80, 72, { ...DEFAULT_DRIVER_INPUTS, selector: 'B', roadGradePercent: -5 }, 18,
    [{ atSeconds: 0, inputs: {}, camera: 'drivetrain', component: 'engine' }],
    ['wheels', 'engine', 'mg2', 'battery'], ['B mode retains useful regeneration.', 'An unfueled spinning engine adds pumping loss.'], 'The descent is controlled without describing B as stronger regeneration.'),
  definition('reverse-launch', 'Reverse launch', 'Reverse', 0, 60, { ...DEFAULT_DRIVER_INPUTS, selector: 'R', accelerator: 0.38 }, 8,
    [{ atSeconds: 0, inputs: {}, camera: 'mg2', component: 'mg2' }],
    ['battery', 'mg2', 'reduction', 'wheels'], ['MG2 torque and wheel speed use signed reverse values.'], 'Vehicle speed becomes negative and SOC falls.'),
  definition('direction-reversal', 'Drive torque while rolling backward', 'Direction reversal', -12, 60, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.42 }, 7,
    [{ atSeconds: 0, inputs: {}, camera: 'mg2', component: 'reduction', explanation: 'Forward torque first regenerates while the car still rolls backward, then propels after zero speed.' }],
    ['wheels', 'differential', 'reduction', 'mg2', 'battery'], ['Opposite-direction torque absorbs the existing backward motion.', 'Wheel and MG2 power pass through zero without losing their signs.', 'After reversal, the same torque becomes EV propulsion.'], 'Vehicle crosses zero speed and continues forward with signed power preserved.'),
  definition('stationary-charge', 'Stationary charging', 'Stationary charge', 0, 43, { ...DEFAULT_DRIVER_INPUTS, selector: 'P' }, 105,
    [{ atSeconds: 0, inputs: {}, camera: 'planetary', component: 'carrier' }],
    ['engine', 'carrier', 'mg1', 'inverter', 'battery'], ['MG1 first cranks the engine.', 'With ring speed zero, fueled carrier power is absorbed by MG1 generation.'], 'Charging remains active until the 60% clearing threshold.'),
  definition('neutral', 'Neutral behavior', 'Neutral', 50, 55, { ...DEFAULT_DRIVER_INPUTS, selector: 'N' }, 12,
    [{ atSeconds: 0, inputs: {}, camera: 'planetary', component: 'planets' }],
    ['sun', 'planets', 'ring'], ['The gearset remains connected.', 'No motor torque, regeneration, or active battery charging is commanded.'], 'Only road load changes vehicle speed.'),
  definition('mg1-protection', 'MG1 overspeed protection', 'MG1 protection', 170, 58, { ...DEFAULT_DRIVER_INPUTS, selector: 'D' }, 10,
    [{ atSeconds: 0, inputs: {}, camera: 'planetary', component: 'mg1' }],
    ['mg1', 'engine', 'carrier', 'ring'], ['Carrier speed is raised to satisfy the planetary equation.', 'MG1 is never clipped independently.'], 'MG1 remains within its signed speed limit with zero kinematic residual.'),
  definition('differential-cornering', 'Differential cornering', 'Cornering', 35, 58, { ...DEFAULT_DRIVER_INPUTS, selector: 'D', accelerator: 0.16 }, 12,
    [{ atSeconds: 0, inputs: {}, camera: 'differential', component: 'differential' }],
    ['differential', 'wheels'], ['The visual demonstration offsets left and right wheel RPM equally around the carrier average.'], 'Left and right wheel speeds differ while their average remains correct.'),
]

export const scenarioById = (id: string) => SCENARIOS.find((scenario) => scenario.id === id)

export function inputsAtTime(initialInputs: DriverInputs, timeline: TimelinePoint[], timeSeconds: number) {
  return timeline
    .filter((point) => point.atSeconds <= timeSeconds + 1e-9)
    .sort((a, b) => a.atSeconds - b.atSeconds)
    .reduce<DriverInputs>((inputs, point) => ({ ...inputs, ...point.inputs }), { ...initialInputs })
}

function hydrateInitialState(options: ScenarioRunOptions['initialState']): SimulationState {
  if (typeof options.batteryEnergyKwh === 'number') return { ...options } as SimulationState
  const base = createInitialSimulationState({
    vehicleSpeedMps: options.vehicleSpeedMps,
    batterySoc: options.batterySoc,
    engineTemperatureC: options.engineTemperatureC,
    engineState: options.engineState,
    engineRpm: options.engineRpm,
    chargeRequestActive: options.chargeRequestActive,
  })
  const state = { ...base, ...options }
  state.batteryEnergyKwh = BATTERY.nominalCapacityKwh * state.batterySoc / 100
  return state
}

export function runScenario(options: ScenarioRunOptions): ScenarioSample[] {
  if (!(options.timestepSeconds > 0)) throw new Error('timestepSeconds must be greater than zero')
  let state = hydrateInitialState(options.initialState)
  const initialInputs = options.initialInputs ?? DEFAULT_DRIVER_INPUTS
  const samples: ScenarioSample[] = []
  let elapsed = 0
  while (elapsed < options.durationSeconds - 1e-9) {
    const inputs = inputsAtTime(initialInputs, options.inputTimeline, elapsed)
    const dt = Math.min(options.timestepSeconds, options.durationSeconds - elapsed)
    const result = stepSimulation(state, inputs, dt)
    state = result.state
    samples.push({ ...result, inputs })
    elapsed += dt
  }
  return samples
}
