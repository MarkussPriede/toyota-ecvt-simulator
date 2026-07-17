import { beforeEach, describe, expect, it } from 'vitest'
import { useSimulator } from './useSimulator'

describe('simulator runtime store', () => {
  beforeEach(() => useSimulator.getState().reset())

  it('treats accelerator and brake as mutually exclusive', () => {
    useSimulator.getState().setInput('accelerator', 0.4)
    useSimulator.getState().setInput('brake', 0.2)
    expect(useSimulator.getState().inputs.accelerator).toBe(0)
    expect(useSimulator.getState().inputs.brake).toBe(0.2)
  })

  it('prevents Park or a direction reversal at unsafe speed', () => {
    useSimulator.getState().applyScenario('coast')
    useSimulator.getState().setSelector('P')
    expect(useSimulator.getState().inputs.selector).toBe('D')
    useSimulator.getState().setSelector('R')
    expect(useSimulator.getState().inputs.selector).toBe('D')
  })

  it('freezes physics, battery, and engine timers while paused', () => {
    useSimulator.getState().applyScenario('low-soc-charge')
    useSimulator.getState().tick(0.5)
    useSimulator.getState().setRunning(false)
    const before = useSimulator.getState().simulation
    useSimulator.getState().tick(5)
    const after = useSimulator.getState().simulation
    expect(after.timeSeconds).toBe(before.timeSeconds)
    expect(after.batterySoc).toBe(before.batterySoc)
    expect(after.crankingTimerSeconds).toBe(before.crankingTimerSeconds)
    expect(after.engineOnTimerSeconds).toBe(before.engineOnTimerSeconds)
  })

  it('changes visual slow-motion and step state without advancing physics', () => {
    useSimulator.getState().setRunning(false)
    const before = useSimulator.getState().simulation
    useSimulator.getState().setVisualSpeed(0.1)
    useSimulator.getState().stepMechanism()
    const after = useSimulator.getState()
    expect(after.visualSpeed).toBe(0.1)
    expect(after.visualStep).toBe(1)
    expect(after.simulation.timeSeconds).toBe(before.timeSeconds)
    expect(after.simulation.batterySoc).toBe(before.batterySoc)
  })

  it('resets a preset to the same state every time', () => {
    useSimulator.getState().applyScenario('ev-launch')
    useSimulator.getState().tick(1)
    useSimulator.getState().applyScenario('hard-brake')
    useSimulator.getState().applyScenario('ev-launch')
    const first = useSimulator.getState().simulation
    useSimulator.getState().tick(1)
    useSimulator.getState().applyScenario('ev-launch')
    const second = useSimulator.getState().simulation
    expect(second.vehicleSpeedMps).toBe(first.vehicleSpeedMps)
    expect(second.batterySoc).toBe(first.batterySoc)
  })

  it('applies each scenario camera cue once without overriding manual inspection', () => {
    useSimulator.getState().applyScenario('ev-launch')
    useSimulator.getState().setSelectedComponent('reduction')
    useSimulator.getState().tick(0.1)
    expect(useSimulator.getState().selectedComponent).toBe('reduction')
  })
})
