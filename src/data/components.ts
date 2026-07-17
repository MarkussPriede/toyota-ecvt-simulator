import type { ComponentId } from '../simulation/types'

export interface ComponentInfo {
  name: string
  tag: string
  purpose: string
  connection: string
  beginner: string
  technical: string
  modeNotes: Record<string, string>
}

export const COMPONENTS: Record<ComponentId, ComponentInfo> = {
  engine: {
    name: '2ZR-FXE petrol engine', tag: 'Heat → rotation',
    purpose: 'Produces efficient mechanical power and heat when the hybrid controller requests it.',
    connection: 'Its crankshaft drives the planetary carrier. There is no launch clutch or stepped gearbox.',
    beginner: 'The engine does not need to match wheel speed. The power-split gears and MG1 let it run at an efficient speed.',
    technical: 'The Atkinson-cycle engine is represented with a 5,200 rpm educational limit and 73 kW peak power.',
    modeNotes: { ENGINE_OFF: 'Produces no combustion torque.', PROPULSION: 'Runs near an efficient operating point.', ASSISTING: 'Runs at high power while the battery assists.', CHARGING: 'Turns the carrier so MG1 can generate.', WARM_UP: 'Runs to reach the warm operating range.', ENGINE_BRAKING: 'Spins unfueled and absorbs pumping work.' },
  },
  mg1: {
    name: 'MG1 motor-generator', tag: 'Speed controller',
    purpose: 'Starts the engine, generates electricity, and controls the sun-gear speed.',
    connection: 'Its rotor is directly connected to the sun gear; its three-phase windings connect to the inverter.',
    beginner: 'By speeding up or slowing down, MG1 changes the allowed relationship between engine and wheel speed.',
    technical: 'MG1 speed is solved from Nr·ωr + Ns·ωs = (Nr + Ns)·ωc and is not assumed to always generate.',
    modeNotes: { ENGINE_OFF: 'Its signed speed still follows the rigid planetary relationship.', PROPULSION: 'Trims engine speed and may generate or motor.', CHARGING: 'Absorbs planetary mechanical power and generates.', STARTING: 'Motors the engine for the bounded crank transient.', MG1_PROTECTION: 'Carrier speed is adjusted to keep MG1 within its limit.' },
  },
  mg2: {
    name: 'MG2 traction motor-generator', tag: 'Drive + regeneration',
    purpose: 'Provides wheel torque and recovers kinetic energy during braking.',
    connection: 'Mechanically geared to the output/final-drive side and electrically connected to the inverter.',
    beginner: 'MG2 is the main electric drive motor. It can also work backward as a generator.',
    technical: 'The fixed ratio is 58/22 = 2.636:1, followed by a 3.267 final drive. RPM is never clipped independently.',
    modeNotes: { ENGINE_OFF: 'May still drive electrically from the battery.', ASSISTING: 'Combines battery and MG1-fed electrical power.', BRAKING: 'Is driven by the wheels and generates.', REVERSING: 'Its fixed-carrier sun rotates opposite the reverse output ring.' },
  },
  sun: {
    name: 'Sun gear', tag: 'MG1 member',
    purpose: 'Forms the centre member of the planetary power-split device.',
    connection: 'Splined to MG1 and meshed with all planet gears.',
    beginner: 'This small centre gear is MG1’s mechanical handle on the entire speed relationship.',
    technical: 'The educational model uses 30 sun teeth.',
    modeNotes: {},
  },
  carrier: {
    name: 'Planet carrier', tag: 'Engine member',
    purpose: 'Holds the planet pins and carries the planet gears around the sun.',
    connection: 'Driven by the petrol engine crankshaft.',
    beginner: 'When the engine runs, it moves this spider-shaped frame and the planets mounted on it.',
    technical: 'Carrier speed is treated as engine speed in the simplified rigid connection.',
    modeNotes: { CHARGING: 'Rotates while a stationary output forces MG1 to generate.', ENGINE_OFF: 'Stops unless protection or engine braking requires rotation.' },
  },
  planets: {
    name: 'Planet gears', tag: 'Power split',
    purpose: 'Mesh the sun to the ring while spinning on their pins and orbiting with the carrier.',
    connection: 'Mounted to the carrier; each meshes externally with the sun and internally with the ring.',
    beginner: 'The planets are the moving bridge that lets all three power-split members have different speeds.',
    technical: 'Their displayed tooth count and pitch are simplified for clarity; spin and orbit remain kinematically linked.',
    modeNotes: {},
  },
  ring: {
    name: 'Ring gear', tag: 'Output member',
    purpose: 'Takes the power-split output toward the reduction and final drive.',
    connection: 'Meshes internally with the planets and is connected to the wheel/output path.',
    beginner: 'This large outer gear is the road side of the power-split device.',
    technical: 'The educational model uses 78 ring teeth; the numerical equation uses the full count even though fewer teeth are drawn.',
    modeNotes: { ENGINE_OFF: 'Can turn from wheel-side motion while the carrier is stopped.', CHARGING: 'May remain at zero while the carrier and sun rotate.' },
  },
  reduction: {
    name: 'MG2 reduction planetary', tag: 'P410-style torque multiplication',
    purpose: 'Reduce MG2 speed and multiply torque before the final drive.',
    connection: 'MG2 drives the 22-tooth sun; the carrier is fixed to the housing; the 58-tooth ring connects to the output path.',
    beginner: 'This second planetary set is a permanent reduction, not a selectable gear. Its fixed carrier multiplies MG2 torque.',
    technical: 'Educational P410-style representation with 22/18/58 sun/planet/ring tooth counts and visible fixed-carrier reaction.',
    modeNotes: {},
  },
  differential: {
    name: 'Final drive & differential', tag: 'Left/right split',
    purpose: 'Applies the final reduction and allows left and right wheels to turn at different speeds in a corner.',
    connection: 'Receives the combined output and sends torque through both driveshafts.',
    beginner: 'It shares the final drive torque between the two front wheels.',
    technical: 'The cutaway shows a carrier, final-drive ring, two side gears, two spider gears, and both outputs.',
    modeNotes: { BRAKING: 'Carries road torque backward from the wheels to MG2.' },
  },
  wheels: {
    name: 'Driven wheels', tag: 'Road interface',
    purpose: 'Convert axle torque into tractive force and vehicle motion.',
    connection: 'Connected to the differential through left and right driveshafts.',
    beginner: 'During braking, the flow can reverse: the turning wheels become the source that drives MG2.',
    technical: 'Vehicle-speed conversion assumes a 0.30 m effective tyre radius.',
    modeNotes: { BRAKING: 'Drive MG2 through the differential.', REVERSING: 'Turn backward under reverse MG2 torque.' },
  },
  battery: {
    name: 'High-voltage battery', tag: 'Electrical store',
    purpose: 'Stores recovered energy and supplies electrical power for traction and system operation.',
    connection: 'Connected to the inverter by a high-voltage DC link.',
    beginner: 'It is a buffer, not the only energy source: engine power can also reach the wheels directly.',
    technical: 'Protected educational window: 40% hard lower, 45% request, 57% preferred, 60% clear, 70% regen taper, 80% hard upper. Positive displayed power means discharge.',
    modeNotes: { ENGINE_OFF: 'May supply MG2 while the engine remains off.', ASSISTING: 'Adds propulsion power.', BRAKING: 'Accepts recovered energy.', CHARGING: 'Accepts generated power until the latch clears.' },
  },
  inverter: {
    name: 'Inverter / power control unit', tag: 'Electrical router',
    purpose: 'Converts battery DC to controlled three-phase AC and routes generated power.',
    connection: 'Electrically connects the battery, MG1 and MG2; it is not a mechanical component.',
    beginner: 'Think of it as a fast, bidirectional power router for the two motor-generators.',
    technical: 'The animation shows direction and approximate magnitude, not switching-level waveforms.',
    modeNotes: { ASSISTING: 'Combines battery and MG1 electrical power for MG2.', BRAKING: 'Routes MG2-generated power back to the battery.', STARTING: 'Routes usable-buffer or protected-reserve power to MG1.' },
  },
}

export const CONCEPTS = [
  ['Why “eCVT”?', 'MG1 continuously controls the speed relationship through the planetary gearset. There are no belts, pulleys, fixed steps, or normal shifts.'],
  ['Engine speed ≠ road speed', 'Changing MG1 speed lets the engine rise to an efficient or powerful RPM without a proportional change in wheel speed.'],
  ['Power can split', 'Only part of engine power may travel electrically through MG1 and MG2; another part reaches the output mechanically.'],
  ['Why the engine starts', 'It may run for power, battery charge, warm-up, cabin heat, emissions control, or system protection.'],
  ['B is not “more regen”', 'B mode adds engine braking on long descents. For ordinary slowing, D normally maximises useful regeneration.'],
  ['Neutral stays connected', 'Neutral commands no motor torque; it does not physically uncouple the planetary set, and active HV-battery charging is unavailable.'],
] as const
