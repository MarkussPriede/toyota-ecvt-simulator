import type { CameraPreset, ComponentId } from '../simulation/types'

export interface TutorialStep {
  title: string
  text: string
  component: ComponentId
  camera: CameraPreset
  scenario?: string
}

export const TUTORIAL: TutorialStep[] = [
  { title: 'Meet the power sources', text: 'The petrol engine and two motor-generators share one compact transaxle; the wheels are at the far right.', component: 'engine', camera: 'drivetrain' },
  { title: 'The power-split device', text: 'A single planetary set replaces the idea of selectable gear ratios.', component: 'planets', camera: 'planetary' },
  { title: 'Three members, three jobs', text: 'MG1 connects to the sun, the engine to the carrier, and the output to the ring.', component: 'sun', camera: 'planetary' },
  { title: 'EV launch', text: 'Battery power drives MG2. The carrier and engine stay still while MG1 responds to the moving ring.', component: 'mg2', camera: 'mg2', scenario: 'ev-launch' },
  { title: 'Engine joins in', text: 'The carrier begins to turn while wheel speed can continue smoothly.', component: 'carrier', camera: 'planetary', scenario: 'engine-joins' },
  { title: 'One input, two paths', text: 'Engine power divides according to planetary member speeds; MG1 may generate while the ring receives mechanical power.', component: 'mg1', camera: 'drivetrain', scenario: 'engine-joins' },
  { title: 'Strong acceleration', text: 'Battery power joins engine power and MG1-generated power at MG2.', component: 'inverter', camera: 'electrical', scenario: 'combined-acceleration' },
  { title: 'Steady cruise', text: 'Mechanical and electrical transfers settle around road demand and the protected SOC target.', component: 'ring', camera: 'planetary', scenario: 'charge-sustain' },
  { title: 'Regenerative braking', text: 'The road drives MG2 as a generator. Energy flows backward to the battery.', component: 'mg2', camera: 'mg2', scenario: 'light-regen' },
  { title: 'Reverse without a gear', text: 'MG2 simply rotates in the opposite direction; the engine is not required.', component: 'wheels', camera: 'differential', scenario: 'reverse-launch' },
  { title: 'Charging while stopped', text: 'With the ring stationary, engine-driven carrier motion forces MG1 to generate.', component: 'mg1', camera: 'planetary', scenario: 'stationary-charge' },
  { title: 'A continuously variable result', text: 'MG1 controls the only free speed in the gear equation, so engine RPM can be chosen continuously without shifts.', component: 'mg1', camera: 'drivetrain', scenario: 'charge-sustain' },
]
