import { DRIVETRAIN, LIMITS, POWER_SPLIT } from './constants'
import { clamp, solveSunRpm } from './planetary'
import type { EnergyFlow, ModeId, SimulationInputs, SimulationOutput } from './types'

const MODE_LABELS: Record<ModeId, string> = {
  ready: 'System ready',
  'ev-launch': 'EV launch',
  'gentle-acceleration': 'Engine + electric drive',
  'strong-acceleration': 'Maximum combined drive',
  cruise: 'Efficient cruise',
  'stationary-charge': 'Stationary charging',
  regeneration: 'Regenerative braking',
  reverse: 'Electric reverse',
  'regen-limited': 'Blended / engine braking',
  neutral: 'Neutral',
  coasting: 'Coasting',
  'warm-up': 'Engine warm-up',
}

const MODE_DESCRIPTIONS: Record<ModeId, string> = {
  ready: 'READY: the car can move electrically even while the petrol engine is stopped.',
  'ev-launch': 'Battery power flows through the inverter to MG2; the engine remains stopped.',
  'gentle-acceleration': 'Engine power splits between the mechanical output path and the MG1-to-MG2 electrical path.',
  'strong-acceleration': 'Engine power and battery assistance combine without exceeding the driveline power and torque limits.',
  cruise: 'Most engine power follows the mechanical path; MG1 trims engine speed with a small electrical transfer.',
  'stationary-charge': 'The engine turns the carrier, MG1 generates, and controlled MG2 torque keeps the output stationary.',
  regeneration: 'MG2 recovers the available braking power; the hydraulic brakes supply any remainder.',
  reverse: 'MG2 turns backward. Toyota hybrids do not need a conventional mechanical reverse gear.',
  'regen-limited': 'Regeneration is blended with engine and hydraulic braking when B is selected or battery acceptance is limited.',
  neutral: 'No drive or regeneration is commanded. The gearset remains mechanically connected.',
  coasting: 'Propulsion demand is near zero; rolling and aerodynamic drag slow the wheels.',
  'warm-up': 'The engine runs for temperature and emissions needs even when wheel power is not requested.',
}

const wheelOmega = (wheelRpm: number) => Math.abs(wheelRpm) * 2 * Math.PI / 60

const powerAtWheel = (torqueNm: number, wheelRpm: number) =>
  Math.abs(torqueNm) * wheelOmega(wheelRpm) / 1_000

function constrainEngineForMg1(ringRpm: number, requestedEngineRpm: number) {
  const { ringTeeth: nr, sunTeeth: ns } = POWER_SPLIT
  const minimum = (nr * ringRpm - ns * LIMITS.mg1Rpm) / (nr + ns)
  const maximum = (nr * ringRpm + ns * LIMITS.mg1Rpm) / (nr + ns)
  const feasibleMinimum = Math.max(0, minimum)
  const feasibleMaximum = Math.min(LIMITS.engineRpm, maximum)

  if (feasibleMinimum > feasibleMaximum) {
    return { engineRpm: clamp(requestedEngineRpm, 0, LIMITS.engineRpm), active: false }
  }

  const engineRpm = clamp(requestedEngineRpm, feasibleMinimum, feasibleMaximum)
  return { engineRpm, active: Math.abs(engineRpm - requestedEngineRpm) > 0.5 }
}

function regenerationAvailability(speedKph: number, batterySoc: number) {
  // Regeneration fades out at walking speed as the hydraulic brakes take over.
  const speedFactor = clamp((speedKph - 3) / 12, 0, 1)
  // Near the top of the teaching SOC window the pack cannot accept full power.
  const socFactor = batterySoc <= 74
    ? 1
    : clamp((LIMITS.batterySocMax - batterySoc) / (LIMITS.batterySocMax - 74), 0, 1)
  return { speedFactor, socFactor }
}

export function selectAutomaticMode(i: SimulationInputs): ModeId {
  if (i.selector === 'N') return 'neutral'
  if (i.selector === 'R') return 'reverse'
  if (i.vehicleSpeed < 0.5 && (i.selector === 'P' || i.brake > 15)) {
    if (!i.engineWarm) return 'warm-up'
    if (i.batterySoc < 34) return 'stationary-charge'
    return 'ready'
  }
  if (i.brake > 3) return i.batterySoc > 76 || i.selector === 'B' ? 'regen-limited' : 'regeneration'
  if (i.selector === 'B' && i.accelerator < 3) return 'regen-limited'
  if (i.accelerator < 3) return 'coasting'
  if (i.accelerator > 72) return 'strong-acceleration'
  if (i.accelerator < 38 && i.vehicleSpeed < 38 && i.batterySoc > 42 && i.engineWarm) return 'ev-launch'
  if (i.accelerator < 32 && i.vehicleSpeed > 38) return 'cruise'
  return 'gentle-acceleration'
}

function mechanicalSpeeds(speedKph: number, reverse: boolean) {
  const direction = reverse ? -1 : 1
  const metresPerSecond = (speedKph / 3.6) * direction
  const wheelRpm = (metresPerSecond / (2 * Math.PI * DRIVETRAIN.wheelRadiusM)) * 60
  const ringRpm = wheelRpm * DRIVETRAIN.finalDriveRatio
  const mg2Rpm = ringRpm * DRIVETRAIN.mg2ReductionRatio
  return { wheelRpm, ringRpm, mg2Rpm }
}

export function calculateSimulation(inputs: SimulationInputs): SimulationOutput {
  const i = {
    ...inputs,
    accelerator: clamp(inputs.accelerator, 0, 100),
    brake: clamp(inputs.brake, 0, 100),
    vehicleSpeed: clamp(inputs.vehicleSpeed, 0, LIMITS.vehicleSpeedKph),
    batterySoc: clamp(inputs.batterySoc, LIMITS.batterySocMin, LIMITS.batterySocMax),
  }
  const selectorOverride: ModeId | null = i.selector === 'N' ? 'neutral' : i.selector === 'R' ? 'reverse' : null
  const mode = selectorOverride ?? (i.automatic || !i.scenario ? selectAutomaticMode(i) : i.scenario)
  const reverse = mode === 'reverse'
  let { wheelRpm, ringRpm, mg2Rpm } = mechanicalSpeeds(i.vehicleSpeed, reverse)
  let engineRpm = 0
  let enginePowerKw = 0
  let batteryPowerKw = 0
  let mg1PowerKw = 0
  let mg2PowerKw = 0
  let regenPowerKw = 0
  let frictionBrakePowerKw = 0
  let wheelPowerKw = 0
  let wheelTorqueNm = 0
  const batteryDischargeFactor = clamp((i.batterySoc - LIMITS.batterySocMin) / 8, 0, 1)

  switch (mode) {
    case 'ready':
      wheelRpm = ringRpm = mg2Rpm = 0
      batteryPowerKw = 0.45
      break
    case 'ev-launch':
      mg2PowerKw = (4 + i.accelerator * 0.32) * batteryDischargeFactor
      wheelTorqueNm = 180 + i.accelerator * 6.2
      break
    case 'gentle-acceleration':
      engineRpm = 1_150 + i.accelerator * 28 + i.vehicleSpeed * 5
      enginePowerKw = 9 + i.accelerator * 0.48
      wheelTorqueNm = 220 + i.accelerator * 7
      break
    case 'strong-acceleration':
      engineRpm = 3_700 + i.accelerator * 15
      enginePowerKw = 48 + i.accelerator * 0.25
      wheelTorqueNm = Math.min(LIMITS.wheelTorqueNm, 720 + i.accelerator * 8)
      break
    case 'cruise':
      engineRpm = 1_250 + i.vehicleSpeed * 12
      enginePowerKw = 8 + i.vehicleSpeed * 0.17 + i.accelerator * 0.16
      wheelTorqueNm = 170 + i.vehicleSpeed * 1.2
      break
    case 'stationary-charge':
      wheelRpm = ringRpm = mg2Rpm = 0
      engineRpm = 1_250
      enginePowerKw = 12
      mg1PowerKw = 8.5
      batteryPowerKw = -7.6
      break
    case 'regeneration': {
      wheelTorqueNm = -Math.min(900, 90 + i.brake * 7.4)
      wheelPowerKw = -powerAtWheel(wheelTorqueNm, wheelRpm)
      const { speedFactor, socFactor } = regenerationAvailability(i.vehicleSpeed, i.batterySoc)
      regenPowerKw = Math.min(-wheelPowerKw * speedFactor, LIMITS.regenPowerKw * speedFactor * socFactor)
      mg2PowerKw = regenPowerKw > 0 ? -regenPowerKw : 0
      batteryPowerKw = regenPowerKw > 0 ? -regenPowerKw * DRIVETRAIN.regenerationEfficiency : 0
      frictionBrakePowerKw = Math.max(0, -wheelPowerKw - regenPowerKw)
      break
    }
    case 'reverse':
      mg2PowerKw = (5 + i.accelerator * 0.28) * batteryDischargeFactor
      wheelTorqueNm = -(160 + i.accelerator * 5.5)
      break
    case 'regen-limited': {
      wheelTorqueNm = -(280 + i.brake * 8)
      wheelPowerKw = -powerAtWheel(wheelTorqueNm, wheelRpm)
      const totalBrakePowerKw = -wheelPowerKw
      const engineBrakeShare = i.selector === 'B' ? 0.35 : i.batterySoc > 78 ? 0.22 : 0
      const engineBrakePowerKw = Math.min(20, totalBrakePowerKw * engineBrakeShare)
      if (engineBrakePowerKw > 0.1) {
        engineRpm = 1_600 + i.vehicleSpeed * 16
        enginePowerKw = -engineBrakePowerKw
      }
      const { speedFactor, socFactor } = regenerationAvailability(i.vehicleSpeed, i.batterySoc)
      const powerAfterEngineBrake = Math.max(0, totalBrakePowerKw - engineBrakePowerKw)
      regenPowerKw = Math.min(powerAfterEngineBrake * speedFactor, LIMITS.regenPowerKw * speedFactor * socFactor)
      mg2PowerKw = regenPowerKw > 0 ? -regenPowerKw : 0
      batteryPowerKw = regenPowerKw > 0 ? -regenPowerKw * DRIVETRAIN.regenerationEfficiency : 0
      frictionBrakePowerKw = Math.max(0, totalBrakePowerKw - engineBrakePowerKw - regenPowerKw)
      break
    }
    case 'neutral':
      engineRpm = !i.engineWarm ? 1_200 : 0
      batteryPowerKw = 0.35
      break
    case 'coasting':
      wheelTorqueNm = -35
      wheelPowerKw = -powerAtWheel(wheelTorqueNm, wheelRpm)
      frictionBrakePowerKw = -wheelPowerKw
      batteryPowerKw = 0.2
      break
    case 'warm-up':
      wheelRpm = ringRpm = mg2Rpm = 0
      engineRpm = 1_320
      enginePowerKw = 8
      mg1PowerKw = 2
      batteryPowerKw = -1.4
      break
  }

  engineRpm = clamp(engineRpm, 0, LIMITS.engineRpm)
  mg2Rpm = clamp(mg2Rpm, -LIMITS.mg2Rpm, LIMITS.mg2Rpm)
  const constrained = constrainEngineForMg1(ringRpm, engineRpm)
  engineRpm = constrained.engineRpm

  // The engine cannot make arbitrary power at low rpm. The 142 Nm production
  // torque rating provides a conservative power ceiling below the 73 kW peak.
  if (enginePowerKw > 0) {
    const rpmPowerLimit = 142 * engineRpm * 2 * Math.PI / 60 / 1_000
    enginePowerKw = Math.min(enginePowerKw, LIMITS.enginePowerKw, rpmPowerLimit)
  }

  // Rebuild the electrical branch from the constrained engine power so MG1 and
  // MG2 cannot retain power that the engine can no longer supply.
  if (mode === 'gentle-acceleration') {
    mg1PowerKw = enginePowerKw * 0.28
    mg2PowerKw = mg1PowerKw * 0.9 + Math.max(0, i.accelerator - 35) * 0.12
    batteryPowerKw = Math.max(-3, mg2PowerKw / 0.92 - mg1PowerKw * 0.92)
  } else if (mode === 'strong-acceleration') {
    mg1PowerKw = enginePowerKw * 0.31
    batteryPowerKw = (18 + i.accelerator * 0.19) * batteryDischargeFactor
    mg2PowerKw = Math.min(LIMITS.mg2PowerKw, mg1PowerKw * 0.86 + batteryPowerKw * 0.9)
  } else if (mode === 'cruise') {
    mg1PowerKw = enginePowerKw * 0.12
    mg2PowerKw = mg1PowerKw * 0.87
    batteryPowerKw = 0.3
  }

  const tractionMode = mode === 'ev-launch'
    || mode === 'gentle-acceleration'
    || mode === 'strong-acceleration'
    || mode === 'cruise'
    || mode === 'reverse'

  if (tractionMode) {
    const mechanicalPathKw = Math.max(0, enginePowerKw - mg1PowerKw) * DRIVETRAIN.propulsionEfficiency
    const motorPathKw = Math.max(0, mg2PowerKw) * DRIVETRAIN.propulsionEfficiency
    const availableWheelPowerKw = Math.min(LIMITS.systemPowerKw, mechanicalPathKw + motorPathKw)
    const torqueLimitedPowerKw = powerAtWheel(wheelTorqueNm, wheelRpm)
    wheelPowerKw = Math.min(availableWheelPowerKw, torqueLimitedPowerKw)
    const powerScale = availableWheelPowerKw > 0 ? wheelPowerKw / availableWheelPowerKw : 0

    enginePowerKw *= powerScale
    mg1PowerKw *= powerScale
    mg2PowerKw *= powerScale
    batteryPowerKw *= powerScale

    const omega = wheelOmega(wheelRpm)
    if (omega > 0.01) wheelTorqueNm = Math.sign(wheelTorqueNm || 1) * wheelPowerKw * 1_000 / omega
    if (mode === 'ev-launch' || mode === 'reverse') batteryPowerKw = mg2PowerKw / 0.92
  }

  const mg1Rpm = solveSunRpm(ringRpm, engineRpm)
  const flows: EnergyFlow[] = []
  const add = (id: EnergyFlow['id'], kind: EnergyFlow['kind'], powerKw: number, direction: 1 | -1 = 1) => {
    if (Math.abs(powerKw) > 0.15) flows.push({ id, kind, powerKw: Math.abs(powerKw), direction })
  }

  if (mode === 'ready') {
    add('battery-inverter', 'battery', batteryPowerKw)
  } else if (mode === 'ev-launch' || mode === 'reverse') {
    add('battery-inverter', 'battery', batteryPowerKw)
    add('inverter-mg2', 'battery', mg2PowerKw)
    add('output-wheels', 'mg2', wheelPowerKw)
  } else if (mode === 'gentle-acceleration' || mode === 'strong-acceleration' || mode === 'cruise') {
    const mechanicalPathKw = Math.max(0, wheelPowerKw - mg2PowerKw * DRIVETRAIN.propulsionEfficiency)
    add('engine-planetary', 'engine', enginePowerKw)
    add('planetary-output', 'engine', mechanicalPathKw)
    add('mg1-inverter', 'mg1', mg1PowerKw)
    add('inverter-mg2', mg1PowerKw > batteryPowerKw ? 'mg1' : 'battery', mg2PowerKw)
    if (batteryPowerKw > 0.2) add('battery-inverter', 'battery', batteryPowerKw)
    else if (batteryPowerKw < -0.2) add('inverter-battery', 'regen', -batteryPowerKw)
    add('output-wheels', 'mg2', wheelPowerKw)
  } else if (mode === 'stationary-charge' || mode === 'warm-up') {
    add('engine-planetary', 'engine', enginePowerKw)
    add('mg1-inverter', 'mg1', mg1PowerKw)
    add('inverter-battery', 'regen', -batteryPowerKw)
  } else if (mode === 'regeneration' || mode === 'regen-limited') {
    add('wheels-mg2', 'regen', regenPowerKw)
    add('inverter-mg2', 'regen', regenPowerKw, -1)
    add('inverter-battery', 'regen', -batteryPowerKw)
  }

  const limitNote = constrained.active
    ? ' Engine speed is being constrained to keep MG1 within its rigid planetary-gear speed limit.'
    : ''

  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    description: MODE_DESCRIPTIONS[mode] + limitNote,
    engineRpm,
    mg1Rpm,
    mg2Rpm,
    ringRpm,
    carrierRpm: engineRpm,
    wheelRpm,
    batteryPowerKw,
    enginePowerKw,
    mg1PowerKw,
    mg2PowerKw,
    regenPowerKw,
    frictionBrakePowerKw,
    wheelPowerKw,
    wheelTorqueNm,
    mg1LimitActive: constrained.active,
    energyFlows: mode === 'neutral' ? [] : flows,
  }
}
