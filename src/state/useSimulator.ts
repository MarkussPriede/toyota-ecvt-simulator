import { create } from 'zustand'
import { DRIVETRAIN, LIMITS } from '../simulation/constants'
import { calculateSimulation } from '../simulation/controller'
import { clamp } from '../simulation/planetary'
import { scenarioById } from '../simulation/scenarios'
import type { CameraPreset, ComponentId, DriveSelector, ModeId, SimulationInputs, SimulationOutput } from '../simulation/types'

interface SimulatorState {
  inputs: SimulationInputs
  output: SimulationOutput
  activeScenarioId: string | null
  running: boolean
  timeScale: number
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
  setInput: <K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) => void
  setSelector: (selector: DriveSelector) => void
  applyScenario: (id: string) => void
  setRunning: (running: boolean) => void
  setTimeScale: (timeScale: number) => void
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

const initialInputs: SimulationInputs = {
  accelerator: 0,
  brake: 0,
  vehicleSpeed: 0,
  batterySoc: 58,
  selector: 'P',
  engineWarm: true,
  automatic: true,
  scenario: null,
}

// The Three.js animation loop runs at display refresh rate, but the educational
// controller and dashboard only need a 10 Hz state update. Throttling here keeps
// React controls responsive while meshes continue to animate smoothly in useFrame.
let simulationAccumulator = 0

export const useSimulator = create<SimulatorState>((set, get) => ({
  inputs: initialInputs,
  output: calculateSimulation(initialInputs),
  activeScenarioId: null,
  running: true,
  timeScale: 1,
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
  setInput: (key, value) => set((state) => {
    let inputs = { ...state.inputs, [key]: value }
    let activeScenarioId = state.activeScenarioId

    if (key === 'automatic') {
      inputs = {
        ...inputs,
        automatic: Boolean(value),
        scenario: value ? null : state.output.mode,
      }
      activeScenarioId = null
    } else if (key !== 'scenario') {
      // Pedals are mutually exclusive driver commands in this teaching model.
      if (key === 'accelerator' && Number(value) > 0) inputs.brake = 0
      if (key === 'brake' && Number(value) > 0) inputs.accelerator = 0

      // The first user edit after loading a preset returns control to the
      // automatic hybrid controller instead of silently leaving the old mode pinned.
      if (activeScenarioId) {
        inputs.automatic = true
        inputs.scenario = null
        activeScenarioId = null
      } else {
        inputs.scenario = state.inputs.automatic ? null : state.inputs.scenario
      }
    }

    return { inputs, activeScenarioId, output: calculateSimulation(inputs) }
  }),
  setSelector: (selector) => {
    const { inputs } = get()
    const reversingDirection = (inputs.selector === 'R' && (selector === 'D' || selector === 'B'))
      || (selector === 'R' && (inputs.selector === 'D' || inputs.selector === 'B'))
    if ((selector === 'P' && inputs.vehicleSpeed > 1) || (reversingDirection && inputs.vehicleSpeed > 5)) return
    get().setInput('selector', selector)
  },
  applyScenario: (id) => {
    const preset = scenarioById(id)
    if (!preset) return
    set((state) => {
      simulationAccumulator = 0
      const inputs = { ...state.inputs, ...preset.inputs, automatic: false, scenario: preset.mode }
      return { inputs, activeScenarioId: id, output: calculateSimulation(inputs), running: true }
    })
  },
  setRunning: (running) => {
    if (!running) simulationAccumulator = 0
    set({ running })
  },
  setTimeScale: (timeScale) => set({ timeScale }),
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
    const state = get()
    if (!state.running) return
    simulationAccumulator += Math.min(deltaSeconds, 0.1)
    if (simulationAccumulator < 0.1) return
    const dt = simulationAccumulator * state.timeScale
    simulationAccumulator = 0
    // Positive battery power means discharge; negative means charging.
    const socDelta = -(state.output.batteryPowerKw * dt / 3600 / DRIVETRAIN.usableBatteryKwh) * 100
    const batterySoc = clamp(state.inputs.batterySoc + socDelta, LIMITS.batterySocMin, LIMITS.batterySocMax)
    const inputs = { ...state.inputs, batterySoc }
    set({ inputs, output: calculateSimulation(inputs) })
  },
  reset: () => {
    simulationAccumulator = 0
    set({
      inputs: initialInputs,
      output: calculateSimulation(initialInputs),
      activeScenarioId: null,
      running: true,
      timeScale: 1,
      exploded: 0,
      selectedComponent: 'ring',
      cameraPreset: 'drivetrain',
      tutorialActive: false,
      tutorialStep: 0,
    })
  },
}))
