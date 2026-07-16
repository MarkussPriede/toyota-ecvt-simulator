import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { POWER_SPLIT, VISUAL_RPM_SCALE } from '../simulation/constants'
import { useSimulator } from '../state/useSimulator'
import { Gear } from './Gear'
import { Selectable } from './Selectable'

export function PowerSplitDevice() {
  const sun = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const carrier = useRef<Group>(null)
  const planetOrbit = useRef<Group>(null)
  const planets = useRef<Group[]>([])
  const output = useSimulator((state) => state.output)
  const running = useSimulator((state) => state.running)
  const timeScale = useSimulator((state) => state.timeScale)

  useFrame((_, delta) => {
    if (!running) return
    const dt = Math.min(delta, 0.05) * timeScale * VISUAL_RPM_SCALE
    if (sun.current) sun.current.rotation.x += output.mg1Rpm * dt
    if (ring.current) ring.current.rotation.x += output.ringRpm * dt
    if (carrier.current) carrier.current.rotation.x += output.carrierRpm * dt
    if (planetOrbit.current) planetOrbit.current.rotation.x += output.carrierRpm * dt
    // Planet spin is relative to the moving carrier; the complete group orbits with it.
    const planetDelta = (output.carrierRpm - output.mg1Rpm) * (POWER_SPLIT.sunTeeth / POWER_SPLIT.planetTeeth) * dt
    planets.current.forEach((planet) => { planet.rotation.x += planetDelta })
  })

  return (
    <group>
      <Selectable id="ring" position={[-1.0, 0, 0]} explode={[0.3, 0, 0]} labelOffset={[0, 1.7, 0]}>
        <group ref={ring}><Gear radius={1.22} width={0.36} teeth={34} inner color="#b7c2ca" emissive="#0b5261" /></group>
      </Selectable>
      <Selectable id="sun" position={[-1.0, 0, 0]} explode={[-0.55, 0, 0]} labelOffset={[0, 0.72, 0]}>
        <group ref={sun}><Gear radius={0.43} width={0.5} teeth={14} color="#d6b65b" emissive="#6a4a05" /></group>
      </Selectable>
      <Selectable id="carrier" position={[-1.0, 0, 0]} explode={[0.62, 0, 0]} labelOffset={[0, -1.55, 0]}>
        <group ref={carrier}>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            return (
              <group key={i} rotation={[a, 0, 0]}>
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
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.66, 24]} />
            <meshStandardMaterial color="#d28b35" metalness={0.82} roughness={0.3} />
          </mesh>
        </group>
      </Selectable>
      <Selectable id="planets" position={[-1.0, 0, 0]} explode={[0, 0.4, 0]} labelOffset={[0, 1.2, 0]}>
        <group ref={planetOrbit}>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            return (
              <group key={i} rotation={[a, 0, 0]}>
                <group ref={(node) => { if (node) planets.current[i] = node }} position={[0, 0.75, 0]}>
                  <Gear radius={0.30} width={0.42} teeth={12} color="#bbc3c8" />
                </group>
              </group>
            )
          })}
        </group>
      </Selectable>
    </group>
  )
}
