import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { POWER_SPLIT, VISUAL_RPM_SCALE } from '../simulation/constants'
import { useSimulator } from '../state/useSimulator'
import { Gear } from './Gear'
import { Selectable } from './Selectable'

export function PowerSplitDevice() {
  const sunPivot = useRef<Group>(null)
  const ringPivot = useRef<Group>(null)
  const carrierPivot = useRef<Group>(null)
  const planetSpinPivots = useRef<Group[]>([])
  const telemetry = useSimulator((state) => state.telemetry)
  const running = useSimulator((state) => state.running)
  const timeScale = useSimulator((state) => state.timeScale)

  useFrame((_, delta) => {
    if (!running) return
    const dt = Math.min(delta, 0.05) * timeScale * VISUAL_RPM_SCALE
    if (sunPivot.current) sunPivot.current.rotation.x += telemetry.mg1Rpm * dt
    if (ringPivot.current) ringPivot.current.rotation.x += telemetry.ringRpm * dt
    if (carrierPivot.current) carrierPivot.current.rotation.x += telemetry.carrierRpm * dt
    const relativePlanetRpm = -(telemetry.mg1Rpm - telemetry.carrierRpm)
      * (POWER_SPLIT.sunTeeth / POWER_SPLIT.planetTeeth)
    planetSpinPivots.current.forEach((planet) => { planet.rotation.x += relativePlanetRpm * dt })
  })

  return (
    <group>
      <Selectable id="ring" position={[-1, 0, 0]} explode={[0.3, 0, 0]} labelOffset={[0, 1.7, 0]}>
        <group ref={ringPivot}><Gear radius={1.22} width={0.36} teeth={POWER_SPLIT.ringTeeth} inner color="#b7c2ca" emissive="#0b5261" /></group>
      </Selectable>
      <Selectable id="sun" position={[-1, 0, 0]} explode={[-0.55, 0, 0]} labelOffset={[0, 0.72, 0]}>
        <group ref={sunPivot}><Gear radius={0.43} width={0.5} teeth={POWER_SPLIT.sunTeeth} color="#d6b65b" emissive="#6a4a05" /></group>
      </Selectable>
      <Selectable id="carrier" position={[-1, 0, 0]} explode={[0.62, 0, 0]} labelOffset={[0, -1.55, 0]}>
        <group ref={carrierPivot}>
          <group name="carrierBody">
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.24, 0.24, 0.66, 24]} />
              <meshStandardMaterial color="#d28b35" metalness={0.82} roughness={0.3} />
            </mesh>
          </group>
          <group name="carrierPins">
            {[0, 1, 2].map((index) => {
              const angle = index / 3 * Math.PI * 2
              return (
                <group key={index} rotation={[angle, 0, 0]}>
                  <mesh position={[0.26, 0.72, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <boxGeometry args={[0.12, 0.12, 1.45]} />
                    <meshStandardMaterial color="#d28b35" metalness={0.82} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0.72, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.10, 0.10, 0.7, 20]} />
                    <meshStandardMaterial color="#c9d0d5" metalness={0.9} roughness={0.2} />
                  </mesh>
                </group>
              )
            })}
          </group>
          <Selectable id="planets" position={[0, 0, 0]} explode={[0, 0, 0]} labelOffset={[0, 1.2, 0]}>
            <group name="planetOrbitPivots">
              {[0, 1, 2].map((index) => {
                const angle = index / 3 * Math.PI * 2
                return (
                  <group key={index} rotation={[angle, 0, 0]}>
                    <group
                      name="planetSpinPivot"
                      ref={(node) => { if (node) planetSpinPivots.current[index] = node }}
                      position={[0, 0.75, 0]}
                    >
                      <Gear radius={0.30} width={0.42} teeth={POWER_SPLIT.planetTeeth} color="#bbc3c8" />
                    </group>
                  </group>
                )
              })}
            </group>
          </Selectable>
        </group>
      </Selectable>
    </group>
  )
}
