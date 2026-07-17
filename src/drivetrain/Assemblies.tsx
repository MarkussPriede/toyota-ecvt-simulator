import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { MG2_REDUCTION, VISUAL_RPM_SCALE } from '../simulation/constants'
import { useSimulator } from '../state/useSimulator'
import { Gear } from './Gear'
import { Selectable } from './Selectable'

function Stator({ radius, length, color }: { radius: number; length: number; color: string }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[radius, radius, length, 48, 1, true]} />
        <meshStandardMaterial color="#53616d" metalness={0.75} roughness={0.3} side={2} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        return (
          <mesh key={i} position={[0, Math.cos(a) * (radius - 0.08), Math.sin(a) * (radius - 0.08)]} rotation={[a, 0, 0]}>
            <boxGeometry args={[length * 0.88, 0.09, 0.16]} />
            <meshStandardMaterial color={color} metalness={0.42} roughness={0.38} emissive={color} emissiveIntensity={0.12} />
          </mesh>
        )
      })}
    </group>
  )
}

export function EngineAssembly() {
  const shaft = useRef<Group>(null)
  const rpm = useSimulator((state) => state.telemetry.engineRpm)
  const running = useSimulator((state) => state.running)
  const scale = useSimulator((state) => state.timeScale)
  useFrame((_, delta) => {
    if (shaft.current && running) shaft.current.rotation.x += rpm * Math.min(delta, 0.05) * scale * VISUAL_RPM_SCALE
  })
  return (
    <Selectable id="engine" position={[-6.1, 0, 0]} explode={[-1.3, 0, 0]} labelOffset={[0, 1.8, 0]}>
      <group>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.3, 2.25, 2.5]} />
          <meshStandardMaterial color="#59646c" metalness={0.78} roughness={0.33} />
        </mesh>
        <mesh position={[0, 1.15, 0]} castShadow>
          <boxGeometry args={[1.75, 0.5, 2.05]} />
          <meshStandardMaterial color="#737f87" metalness={0.78} roughness={0.27} />
        </mesh>
        {[[-0.4, -0.85], [-0.4, 0.85], [0.45, -0.85], [0.45, 0.85]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.35, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.32, 0.32, 0.6, 24]} />
            <meshStandardMaterial color="#2d353b" metalness={0.72} roughness={0.35} />
          </mesh>
        ))}
        <group ref={shaft}>
          <mesh position={[1.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.16, 0.16, 2.1, 24]} />
            <meshStandardMaterial color="#d48230" metalness={0.9} roughness={0.18} emissive="#6a2f05" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[1.0, 0, 0]}><Gear radius={0.48} width={0.24} teeth={18} color="#c77b2d" /></mesh>
        </group>
      </group>
    </Selectable>
  )
}

export function MotorAssembly({ kind }: { kind: 'mg1' | 'mg2' }) {
  const rotor = useRef<Group>(null)
  const output = useSimulator((state) => state.telemetry)
  const running = useSimulator((state) => state.running)
  const scale = useSimulator((state) => state.timeScale)
  const isMg1 = kind === 'mg1'
  const position: [number, number, number] = isMg1 ? [-3.25, 0, 0] : [1.7, 0, 0]
  const rpm = isMg1 ? output.mg1Rpm : output.mg2Rpm
  useFrame((_, delta) => {
    if (rotor.current && running) rotor.current.rotation.x += rpm * Math.min(delta, 0.05) * scale * VISUAL_RPM_SCALE
  })
  return (
    <Selectable id={kind} position={position} explode={isMg1 ? [-0.8, 0, 0] : [0.9, 0, 0]} labelOffset={[0, 1.45, 0]}>
      <group>
        <Stator radius={isMg1 ? 1.0 : 1.2} length={isMg1 ? 1.25 : 1.55} color={isMg1 ? '#a985ff' : '#45d7ea'} />
        <group ref={rotor}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[isMg1 ? 0.58 : 0.7, isMg1 ? 0.58 : 0.7, isMg1 ? 1.38 : 1.68, 40]} />
            <meshStandardMaterial color={isMg1 ? '#64549c' : '#217f8d'} metalness={0.72} roughness={0.24} emissive={isMg1 ? '#271c5a' : '#063a46'} emissiveIntensity={0.45} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 2.15, 20]} />
            <meshStandardMaterial color="#d6dce0" metalness={0.92} roughness={0.17} />
          </mesh>
        </group>
      </group>
    </Selectable>
  )
}

export function ReductionAssembly() {
  const sun = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const planets = useRef<Group[]>([])
  const rpm = useSimulator((state) => state.telemetry.mg2Rpm)
  const running = useSimulator((state) => state.running)
  const scale = useSimulator((state) => state.timeScale)
  useFrame((_, delta) => {
    if (!running) return
    const d = rpm * Math.min(delta, 0.05) * scale * VISUAL_RPM_SCALE
    if (sun.current) sun.current.rotation.x += d
    if (ring.current) ring.current.rotation.x -= d * (MG2_REDUCTION.sunTeeth / MG2_REDUCTION.ringTeeth)
    planets.current.forEach((planet) => {
      planet.rotation.x -= d * (MG2_REDUCTION.sunTeeth / MG2_REDUCTION.planetTeeth)
    })
  })
  return (
    <Selectable id="reduction" position={[3.65, 0, 0]} explode={[1.05, 0, 0]} labelOffset={[0, 1.7, 0]}>
      <group ref={ring}><Gear radius={1.18} width={0.38} teeth={MG2_REDUCTION.ringTeeth} inner color="#a9b7bd" emissive="#073c46" /></group>
      <group ref={sun}><Gear radius={0.43} width={0.52} teeth={MG2_REDUCTION.sunTeeth} color="#4cb9c8" emissive="#063f49" /></group>
      <group>
        {[0, 1, 2].map((index) => {
          const angle = index / 3 * Math.PI * 2
          return (
            <group key={index} rotation={[angle, 0, 0]}>
              <group ref={(node) => { if (node) planets.current[index] = node }} position={[0, 0.76, 0]}>
                <Gear radius={0.34} width={0.44} teeth={MG2_REDUCTION.planetTeeth} color="#9eacb3" />
              </group>
              <mesh position={[0, 0.76, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.09, 0.09, 0.8, 18]} />
                <meshStandardMaterial color="#d35d57" metalness={0.8} roughness={0.25} />
              </mesh>
            </group>
          )
        })}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.24, 0.24, 0.72, 24]} />
          <meshStandardMaterial color="#6e3030" metalness={0.78} roughness={0.3} />
        </mesh>
        <mesh position={[0, -1.38, 0]}>
          <boxGeometry args={[0.42, 0.55, 0.75]} />
          <meshStandardMaterial color="#7a3a39" metalness={0.65} roughness={0.35} />
        </mesh>
      </group>
    </Selectable>
  )
}

export function DifferentialAssembly() {
  const diff = useRef<Group>(null)
  const wheelL = useRef<Group>(null)
  const wheelR = useRef<Group>(null)
  const rpm = useSimulator((state) => state.telemetry.wheelRpm)
  const cornering = useSimulator((state) => state.activeScenarioId === 'differential-cornering')
  const running = useSimulator((state) => state.running)
  const scale = useSimulator((state) => state.timeScale)
  useFrame((_, delta) => {
    if (!running) return
    const d = rpm * Math.min(delta, 0.05) * scale * VISUAL_RPM_SCALE
    if (diff.current) diff.current.rotation.x += d
    if (wheelL.current) wheelL.current.rotation.z += d * (cornering ? 0.82 : 1)
    if (wheelR.current) wheelR.current.rotation.z += d * (cornering ? 1.18 : 1)
  })
  return (
    <group>
      <Selectable id="differential" position={[5.55, -0.25, 0]} explode={[1.2, 0, 0]} labelOffset={[0, 1.55, 0]}>
        <group ref={diff}>
          <Gear radius={0.96} width={0.28} teeth={38} color="#b7c0c4" />
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.58, 0.12, 12, 36]} />
            <meshStandardMaterial color="#70818a" metalness={0.86} roughness={0.25} />
          </mesh>
          {[-0.28, 0.28].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.34, 0.32, 18]} />
            <meshStandardMaterial color="#d7bd68" metalness={0.78} roughness={0.26} />
          </mesh>)}
          {[-0.22, 0.22].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.22, 0.24, 16]} />
            <meshStandardMaterial color="#aeb8bd" metalness={0.82} roughness={0.24} />
          </mesh>)}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 1.05, 16]} />
            <meshStandardMaterial color="#c9d2d6" metalness={0.9} roughness={0.18} />
          </mesh>
        </group>
      </Selectable>
      <Selectable id="wheels" position={[5.55, -0.25, 0]} explode={[1.5, 0, 0]} labelOffset={[0, 2.1, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 6.5, 18]} />
          <meshStandardMaterial color="#aeb8bd" metalness={0.88} roughness={0.2} />
        </mesh>
        <group ref={wheelL} position={[0, 0, -3.55]}>
          <mesh castShadow><torusGeometry args={[0.92, 0.28, 18, 48]} /><meshStandardMaterial color="#171d21" metalness={0.12} roughness={0.72} /></mesh>
          <mesh position={[0, 0, -0.02]}><boxGeometry args={[0.12, 1.35, 0.3]} /><meshStandardMaterial color="#354149" metalness={0.55} roughness={0.4} /></mesh>
        </group>
        <group ref={wheelR} position={[0, 0, 3.55]}>
          <mesh castShadow><torusGeometry args={[0.92, 0.28, 18, 48]} /><meshStandardMaterial color="#171d21" metalness={0.12} roughness={0.72} /></mesh>
          <mesh position={[0, 0, 0.02]}><boxGeometry args={[0.12, 1.35, 0.3]} /><meshStandardMaterial color="#354149" metalness={0.55} roughness={0.4} /></mesh>
        </group>
      </Selectable>
    </group>
  )
}

function Shaft({ position, length, axis = 'x', active = false }: { position: [number, number, number]; length: number; axis?: 'x' | 'z'; active?: boolean }) {
  return (
    <mesh position={position} rotation={axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[active ? 0.105 : 0.075, active ? 0.105 : 0.075, length, 18]} />
      <meshStandardMaterial color={active ? '#66e9ff' : '#8b9da5'} emissive={active ? '#0b6372' : '#000000'} emissiveIntensity={active ? 0.8 : 0} metalness={0.92} roughness={0.18} />
    </mesh>
  )
}

export function MechanicalConnections() {
  const selected = useSimulator((state) => state.selectedComponent)
  const powerSplitActive = ['engine', 'carrier', 'planets', 'sun', 'mg1', 'ring'].includes(selected)
  const outputActive = ['ring', 'mg2', 'reduction', 'differential', 'wheels'].includes(selected)
  return (
    <group>
      <Shaft position={[-4.65, 0, 0]} length={2.9} active={powerSplitActive} />
      <Shaft position={[-2.05, 0, 0]} length={1.55} active={powerSplitActive} />
      <Shaft position={[1.25, 0, 0]} length={3.15} active={outputActive} />
      <Shaft position={[4.75, -0.25, 0]} length={1.6} active={outputActive} />
      <Shaft position={[5.55, -0.25, 0]} length={6.5} axis="z" active={selected === 'differential' || selected === 'wheels'} />
    </group>
  )
}

export function ElectricalAssembly() {
  return (
    <group>
      <Selectable id="battery" position={[-0.3, 3.25, -2.7]} explode={[0, 1.0, -0.7]} labelOffset={[0, 0.9, 0]}>
        <mesh castShadow>
          <boxGeometry args={[3.7, 1.0, 1.35]} />
          <meshStandardMaterial color="#24546b" metalness={0.52} roughness={0.3} emissive="#06374a" emissiveIntensity={0.35} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i} position={[-1.55 + i * 0.34, 0.54, 0]}>
            <boxGeometry args={[0.23, 0.08, 0.95]} />
            <meshStandardMaterial color="#54b7cf" metalness={0.45} roughness={0.25} />
          </mesh>
        ))}
      </Selectable>
      <Selectable id="inverter" position={[2.6, 2.75, -2.25]} explode={[0.5, 1.1, -0.8]} labelOffset={[0, 0.9, 0]}>
        <mesh castShadow>
          <boxGeometry args={[2.0, 1.2, 1.6]} />
          <meshStandardMaterial color="#6b7780" metalness={0.75} roughness={0.26} />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[-0.78 + i * 0.19, 0.68, 0]}>
            <boxGeometry args={[0.08, 0.35, 1.3]} />
            <meshStandardMaterial color="#a6b0b5" metalness={0.82} roughness={0.22} />
          </mesh>
        ))}
      </Selectable>
    </group>
  )
}
