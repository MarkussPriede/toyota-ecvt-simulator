import { beforeEach, describe, expect, it } from 'vitest'
import { useSimulator } from './useSimulator'

describe('simulator controls', () => {
  beforeEach(() => useSimulator.getState().reset())

  it('treats accelerator and brake as mutually exclusive commands', () => {
    useSimulator.getState().setInput('accelerator', 35)
    useSimulator.getState().setInput('brake', 20)

    expect(useSimulator.getState().inputs.accelerator).toBe(0)
    expect(useSimulator.getState().inputs.brake).toBe(20)
  })

  it('exits a pinned preset on the first direct driver edit', () => {
    useSimulator.getState().applyScenario('full-power')
    expect(useSimulator.getState().activeScenarioId).toBe('full-power')
    expect(useSimulator.getState().inputs.automatic).toBe(false)

    useSimulator.getState().setInput('accelerator', 55)
    expect(useSimulator.getState().activeScenarioId).toBeNull()
    expect(useSimulator.getState().inputs.automatic).toBe(true)
    expect(useSimulator.getState().inputs.scenario).toBeNull()
  })

  it('prevents Park or a direction reversal while moving', () => {
    useSimulator.getState().setSelector('D')
    useSimulator.getState().setInput('vehicleSpeed', 30)
    useSimulator.getState().setSelector('P')
    expect(useSimulator.getState().inputs.selector).toBe('D')

    useSimulator.getState().setSelector('R')
    expect(useSimulator.getState().inputs.selector).toBe('D')
  })
})
