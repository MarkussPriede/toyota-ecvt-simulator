import { create } from 'zustand'
import { BATTERY, maxVehicleSpeedMps } from '../simulation/constants'
import { clamp } from '../simulation/planetary'
import { createInitialSimulationState, DEFAULT_DRIVER_INPUTS, stepSimulation } from '../simulation/engine'
import { inputsAtTime, scenarioById } from '../simulation/scenarios'
import type {
  CameraPreset,
  ComponentId,
  DriverInputs,
  DriveSelector,
  PowerDiagnostics,
  SimulationState,
  SimulationTelemetry,
  VisualMode,
} from '../simulation/types'

interface SimulatorStore {
  inputs: DriverInputs
  simulation: SimulationState
  telemetry: SimulationTelemetry
  diagnostics: PowerDiagnostics
  activeScenarioId: string | null
  scenarioElapsedSeconds: number
  running: boolean
  timeScale: number
  visualMode: VisualMode
  developerMode: boolean
  inspectionMode: boolean
  housingOpacity: number
  exploded: number
  labels: boolean
  energyArrows: boolean
  rotationArrows: boolean
  selectedComponent: ComponentId
  cameraPreset: CameraPreset
  tutorialActive: boolean
  tutorialStep: number
  quality: 'low' | 'medium' | 'high'
  setInput: <K extends keyof DriverInputs>(key: K, value: DriverInputs[K]) => void
  setBatterySoc: (soc: number) => void
  setEngineTemperature: (temperatureC: number) => void
  setInspectionSpeedKph: (speedKph: number) => void
  setSelector: (selector: DriveSelector) => void
  applyScenario: (id: string) => void
  setRunning: (running: boolean) => void
  setTimeScale: (timeScale: number) => void
  setVisualMode: (mode: VisualMode) => void
  setDeveloperMode: (enabled: boolean) => void
  setInspectionMode: (enabled: boolean) => void
  setHousingOpacity: (opacity: number) => void
  setExploded: (amount: number) => void
  setLabels: (labels: boolean) => void
  setEnergyArrows: (visible: boolean) => void
  setRotationArrows: (visible: boolean) => void
  setSelectedComponent: (component: ComponentId) => void
  setCameraPreset: (preset: CameraPreset) => void
  setTutorial: (active: boolean, step?: number) => void
  setTutorialStep: (step: number) => void
  setQuality: (quality: 'low' | 'medium' | 'high') => void
  tick: (deltaSeconds: number) => void
  reset: () => void
}

const initialSimulation = createInitialSimulationState()
const initialResult = stepSimulation(initialSimulation, DEFAULT_DRIVER_INPUTS, 0)
let renderAccumulator = 0

function scenarioState(id: string) {
  const scenario = scenarioById(id)
  if (!scenario) return null
  const base = createInitialSimulationState({
    vehicleSpeedMps: scenario.initialState.vehicleSpeedMps,
    batterySoc: scenario.initialState.batterySoc,
    engineTemperatureC: scenario.initialState.engineTemperatureC,
    engineState: scenario.initialState.engineState,
    engineRpm: scenario.initialState.engineRpm,
    chargeRequestActive: scenario.initialState.chargeRequestActive,
  })
  const simulation = { ...base, ...scenario.initialState }
  simulation.batteryEnergyKwh = BATTERY.nominalCapacityKwh * simulation.batterySoc / 100
  const result = stepSimulation(simulation, scenario.initialInputs, 0)
  return { scenario, result }
}

export const useSimulator = create<SimulatorStore>((set, get) => ({
  inputs: { ...DEFAULT_DRIVER_INPUTS },
  simulation: initialResult.state,
  telemetry: initialResult.telemetry,
  diagnostics: initialResult.diagnostics,
  activeScenarioId: null,
  scenarioElapsedSeconds: 0,
  running: true,
  timeScale: 1,
  visualMode: 'schematic',
  developerMode: false,
  inspectionMode: false,
  housingOpacity: 0.16,
  exploded: 0,
  labels: true,
  energyArrows: true,
  rotationArrows: false,
  selectedComponent: 'ring',
  cameraPreset: 'drivetrain',
  tutorialActive: false,
  tutorialStep: 0,
  quality: 'high',
  setInput: (key, value) => set((store) => {
    const inputs = { ...store.inputs, [key]: value }
    if (key === 'accelerator' && Number(value) > 0) inputs.brake = 0
    if (key === 'brake' && Number(value) > 0) inputs.accelerator = 0
    return { inputs, activeScenarioId: null, scenarioElapsedSeconds: 0 }
  }),
  setBatterySoc: (soc) => set((store) => {
    const batterySoc = clamp(soc, BATTERY.hardLowerSoc, BATTERY.hardUpperSoc)
    const simulation = {
      ...store.simulation,
      batterySoc,
      batteryEnergyKwh: BATTERY.nominalCapacityKwh * batterySoc / 100,
      chargeRequestActive: batterySoc <= BATTERY.chargeRequestSoc
        ? true
        : batterySoc >= BATTERY.chargeClearSoc
          ? false
          : store.simulation.chargeRequestActive,
    }
    const result = stepSimulation(simulation, store.inputs, 0)
    return { simulation: result.state, telemetry: result.telemetry, diagnostics: result.diagnostics, activeScenarioId: null }
  }),
  setEngineTemperature: (engineTemperatureC) => set((store) => {
    const simulation = { ...store.simulation, engineTemperatureC: clamp(engineTemperatureC, 20, 105) }
    const result = stepSimulation(simulation, store.inputs, 0)
    return { simulation: result.state, telemetry: result.telemetry, diagnostics: result.diagnostics, activeScenarioId: null }
  }),
  setInspectionSpeedKph: (speedKph) => set((store) => {
    if (!store.inspectionMode || store.running) return {}
    const signedSpeed = store.inputs.selector === 'R' ? -Math.abs(speedKph) : Math.abs(speedKph)
    const simulation = { ...store.simulation, vehicleSpeedMps: clamp(signedSpeed / 3.6, -maxVehicleSpeedMps, maxVehicleSpeedMps) }
    const result = stepSimulation(simulation, store.inputs, 0)
    return { simulation: result.state, telemetry: result.telemetry, diagnostics: result.diagnostics, activeScenarioId: null }
  }),
  setSelector: (selector) => {
    const store = get()
    const speedKph = Math.abs(store.simulation.vehicleSpeedMps) * 3.6
    const reversing = (store.inputs.selector === 'R' && (selector === 'D' || selector === 'B'))
      || (selector === 'R' && (store.inputs.selector === 'D' || store.inputs.selector === 'B'))
    if ((selector === 'P' && speedKph > 1) || (reversing && speedKph > 5)) return
    store.setInput('selector', selector)
  },
  applyScenario: (id) => {
    const prepared = scenarioState(id)
    if (!prepared) return
    renderAccumulator = 0
    const firstCue = prepared.scenario.cameraSequence[0]
    set({
      inputs: { ...prepared.scenario.initialInputs },
      simulation: prepared.result.state,
      telemetry: prepared.result.telemetry,
      diagnostics: prepared.result.diagnostics,
      activeScenarioId: id,
      scenarioElapsedSeconds: 0,
      running: true,
      inspectionMode: false,
      cameraPreset: firstCue?.camera ?? 'drivetrain',
      selectedComponent: firstCue?.component ?? prepared.scenario.highlightedComponents[0] ?? 'ring',
    })
  },
  setRunning: (running) => {
    renderAccumulator = 0
    set({ running })
  },
  setTimeScale: (timeScale) => set({ timeScale }),
  setVisualMode: (visualMode) => set({ visualMode }),
  setDeveloperMode: (developerMode) => set({ developerMode }),
  setInspectionMode: (inspectionMode) => {
    if (inspectionMode) get().setRunning(false)
    set({ inspectionMode, activeScenarioId: null })
  },
  setHousingOpacity: (housingOpacity) => set({ housingOpacity }),
  setExploded: (exploded) => set({ exploded }),
  setLabels: (labels) => set({ labels }),
  setEnergyArrows: (energyArrows) => set({ energyArrows }),
  setRotationArrows: (rotationArrows) => set({ rotationArrows }),
  setSelectedComponent: (selectedComponent) => set({ selectedComponent }),
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setTutorial: (tutorialActive, tutorialStep = 0) => set({ tutorialActive, tutorialStep }),
  setTutorialStep: (tutorialStep) => set({ tutorialStep }),
  setQuality: (quality) => set({ quality }),
  tick: (deltaSeconds) => {
    const store = get()
    if (!store.running || store.inspectionMode) return
    renderAccumulator += Math.min(deltaSeconds, 0.1)
    if (renderAccumulator < 1 / 30) return
    const dt = renderAccumulator * store.timeScale
    renderAccumulator = 0
    const scenario = store.activeScenarioId ? scenarioById(store.activeScenarioId) : null
    const inputs = scenario ? inputsAtTime(scenario.initialInputs, scenario.inputTimeline, store.scenarioElapsedSeconds) : store.inputs
    const result = stepSimulation(store.simulation, inputs, dt)
    const scenarioElapsedSeconds = scenario ? store.scenarioElapsedSeconds + dt : 0
    const latestCue = scenario?.cameraSequence
      .filter((point) => point.atSeconds <= scenarioElapsedSeconds)
      .sort((a, b) => b.atSeconds - a.atSeconds)[0]
    const chargeDemoComplete = Boolean(
      scenario
      && (scenario.id === 'low-soc-charge' || scenario.id === 'stationary-charge')
      && store.simulation.chargeRequestActive
      && !result.state.chargeRequestActive,
    )
    const stopDemoComplete = Boolean(scenario?.id === 'hard-brake' && Math.abs(result.state.vehicleSpeedMps) < 0.08)
    const engineStartComplete = Boolean(scenario?.id === 'engine-start' && result.state.engineState === 'FUELED')
    const scenarioComplete = Boolean(scenario && (
      scenarioElapsedSeconds >= scenario.durationSeconds || chargeDemoComplete || stopDemoComplete || engineStartComplete
    ))
    set({
      inputs,
      simulation: result.state,
      telemetry: result.telemetry,
      diagnostics: result.diagnostics,
      scenarioElapsedSeconds,
      running: scenarioComplete ? false : store.running,
      cameraPreset: latestCue?.camera ?? store.cameraPreset,
      selectedComponent: latestCue?.component ?? store.selectedComponent,
    })
  },
  reset: () => {
    renderAccumulator = 0
    const simulation = createInitialSimulationState()
    const result = stepSimulation(simulation, DEFAULT_DRIVER_INPUTS, 0)
    set({
      inputs: { ...DEFAULT_DRIVER_INPUTS },
      simulation: result.state,
      telemetry: result.telemetry,
      diagnostics: result.diagnostics,
      activeScenarioId: null,
      scenarioElapsedSeconds: 0,
      running: true,
      timeScale: 1,
      visualMode: 'schematic',
      developerMode: false,
      inspectionMode: false,
      exploded: 0,
      selectedComponent: 'ring',
      cameraPreset: 'drivetrain',
      tutorialActive: false,
      tutorialStep: 0,
    })
  },
}))
