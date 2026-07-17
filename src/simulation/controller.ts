// Public simulation entry point kept at the original module path for consumers.
// The controller is now a deterministic, time-based engine rather than a static
// teaching-state lookup.
export {
  calculateKinematics,
  createInitialSimulationState,
  DEFAULT_DRIVER_INPUTS,
  speedToWheelRpm,
  stepSimulation,
} from './engine'
export { inputsAtTime, runScenario } from './scenarios'
