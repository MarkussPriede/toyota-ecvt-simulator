import { describe, expect, it } from 'vitest'
import { calculateSimulation, selectAutomaticMode } from './controller'
import { LIMITS, POWER_SPLIT } from './constants'
import { solveCarrierRpm, solveRingRpm, solveSunRpm } from './planetary'
import type { SimulationInputs } from './types'

const base: SimulationInputs = {
  accelerator: 0,
  brake: 0,
  vehicleSpeed: 0,
  batterySoc: 55,
  selector: 'P',
  engineWarm: true,
  automatic: false,
  scenario: 'ready',
}

describe('planetary power-split relationship', () => {
  it('satisfies Nr·wr + Ns·ws = (Nr + Ns)·wc', () => {
    const ring = 1_260
    const carrier = 2_150
    const sun = solveSunRpm(ring, carrier)
    const left = POWER_SPLIT.ringTeeth * ring + POWER_SPLIT.sunTeeth * sun
    const right = (POWER_SPLIT.ringTeeth + POWER_SPLIT.sunTeeth) * carrier
    expect(left).toBeCloseTo(right, 8)
    expect(solveRingRpm(sun, carrier)).toBeCloseTo(ring, 8)
    expect(solveCarrierRpm(ring, sun)).toBeCloseTo(carrier, 8)
  })

  it('counter-rotates MG1 during EV motion with a stopped engine', () => {
    const result = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 22, accelerator: 28, scenario: 'ev-launch' })
    expect(result.engineRpm).toBe(0)
    expect(result.ringRpm).toBeGreaterThan(0)
    expect(result.mg1Rpm).toBeLessThan(0)
  })

  it('constrains engine speed instead of clipping MG1 away from the rigid gear equation', () => {
    const result = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 74, accelerator: 96, scenario: 'strong-acceleration' })
    const left = POWER_SPLIT.ringTeeth * result.ringRpm + POWER_SPLIT.sunTeeth * result.mg1Rpm
    const right = (POWER_SPLIT.ringTeeth + POWER_SPLIT.sunTeeth) * result.engineRpm

    expect(result.mg1LimitActive).toBe(true)
    expect(result.mg1Rpm).toBeCloseTo(LIMITS.mg1Rpm, 6)
    expect(result.engineRpm).toBeLessThan(5_140)
    expect(left).toBeCloseTo(right, 6)
  })
})

describe('hybrid operating modes', () => {
  it('uses MG2 backward for reverse without the engine', () => {
    const result = calculateSimulation({ ...base, selector: 'R', vehicleSpeed: 12, accelerator: 35, scenario: 'reverse' })
    expect(result.engineRpm).toBe(0)
    expect(result.mg2Rpm).toBeLessThan(0)
    expect(result.wheelTorqueNm).toBeLessThan(0)
    expect(result.energyFlows.some((flow) => flow.id === 'battery-inverter')).toBe(true)
  })

  it('routes regenerative braking from wheels to the battery', () => {
    const result = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 70, brake: 55, batterySoc: 50, scenario: 'regeneration' })
    expect(result.mg2PowerKw).toBeLessThan(0)
    expect(result.batteryPowerKw).toBeLessThan(0)
    expect(result.regenPowerKw).toBeGreaterThan(0)
    expect(result.energyFlows.map((flow) => flow.id)).toEqual(expect.arrayContaining(['wheels-mg2', 'inverter-mg2', 'inverter-battery']))
  })

  it('charges while stationary through engine and MG1', () => {
    const result = calculateSimulation({ ...base, batterySoc: 25, scenario: 'stationary-charge' })
    expect(result.wheelRpm).toBe(0)
    expect(result.ringRpm).toBe(0)
    expect(result.engineRpm).toBeGreaterThan(0)
    expect(result.mg1Rpm).toBeGreaterThan(result.engineRpm)
    expect(result.batteryPowerKw).toBeLessThan(0)
  })

  it('commands no drive, regeneration, or arrows in Neutral', () => {
    const result = calculateSimulation({ ...base, selector: 'N', vehicleSpeed: 40, automatic: true, scenario: null })
    expect(result.mode).toBe('neutral')
    expect(result.wheelTorqueNm).toBe(0)
    expect(result.regenPowerKw).toBe(0)
    expect(result.energyFlows).toHaveLength(0)
  })

  it('lets Neutral override an active demonstration preset', () => {
    const result = calculateSimulation({ ...base, selector: 'N', vehicleSpeed: 74, accelerator: 96, scenario: 'strong-acceleration' })
    expect(result.mode).toBe('neutral')
    expect(result.wheelTorqueNm).toBe(0)
    expect(result.energyFlows).toHaveLength(0)
  })

  it('limits regeneration near a full battery', () => {
    expect(selectAutomaticMode({ ...base, selector: 'D', automatic: true, scenario: null, vehicleSpeed: 60, brake: 40, batterySoc: 79 })).toBe('regen-limited')
  })

  it('keeps reported wheel power consistent with wheel torque and speed', () => {
    const result = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 32, accelerator: 48, scenario: 'gentle-acceleration' })
    const wheelOmega = Math.abs(result.wheelRpm) * 2 * Math.PI / 60

    expect(result.wheelPowerKw).toBeCloseTo(Math.abs(result.wheelTorqueNm) * wheelOmega / 1_000, 6)
    expect(result.wheelPowerKw).toBeLessThanOrEqual(LIMITS.systemPowerKw)
    expect(result.enginePowerKw + Math.max(0, result.batteryPowerKw)).toBeGreaterThan(result.wheelPowerKw)
  })

  it('phases out regeneration at low speed and blends hydraulic braking at high demand', () => {
    const stopped = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 0, brake: 60, scenario: 'regeneration' })
    const hardBrake = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 72, brake: 92, scenario: 'regeneration' })

    expect(stopped.regenPowerKw).toBe(0)
    expect(stopped.batteryPowerKw).toBe(0)
    expect(hardBrake.regenPowerKw).toBeLessThanOrEqual(LIMITS.regenPowerKw)
    expect(hardBrake.frictionBrakePowerKw).toBeGreaterThan(0)
    expect(-hardBrake.wheelPowerKw).toBeCloseTo(hardBrake.regenPowerKw + hardBrake.frictionBrakePowerKw, 6)
  })

  it('uses normal regeneration plus engine braking in B instead of suppressing regeneration', () => {
    const result = calculateSimulation({ ...base, selector: 'B', vehicleSpeed: 82, brake: 18, batterySoc: 60, scenario: 'regen-limited' })

    expect(result.enginePowerKw).toBeLessThan(0)
    expect(result.regenPowerKw).toBeGreaterThan(9)
    expect(result.batteryPowerKw).toBeLessThan(0)
  })

  it('removes battery assist at the protected lower SOC boundary', () => {
    const result = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 74, accelerator: 96, batterySoc: LIMITS.batterySocMin, scenario: 'strong-acceleration' })

    expect(result.batteryPowerKw).toBe(0)
    expect(result.mg2PowerKw).toBeGreaterThan(0)
    expect(result.wheelPowerKw).toBeLessThan(LIMITS.systemPowerKw)
  })

  it('clamps all unsafe input and RPM values', () => {
    const result = calculateSimulation({ ...base, selector: 'D', vehicleSpeed: 9_999, accelerator: 9_999, batterySoc: -100, scenario: 'strong-acceleration' })
    expect(Math.abs(result.mg1Rpm)).toBeLessThanOrEqual(LIMITS.mg1Rpm)
    expect(Math.abs(result.mg2Rpm)).toBeLessThanOrEqual(LIMITS.mg2Rpm)
    expect(result.engineRpm).toBeLessThanOrEqual(LIMITS.engineRpm)
  })
})
