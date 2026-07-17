import { useRef } from 'react'
import type { Group } from 'three'
import { Html, Line } from '@react-three/drei'
import { DRIVETRAIN, MG2_REDUCTION } from '../simulation/constants'
import { useSimulator } from '../state/useSimulator'
import { Gear } from './Gear'
import { Selectable } from './Selectable'
import { useMechanicalMotion } from './useMechanicalMotion'
import { fixedCarrierPlanetRpm, reductionRingRpm } from './visualMechanics'

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
  useMechanicalMotion((rotationForRpm) => {
    if (shaft.current) shaft.current.rotation.x += rotationForRpm(rpm)
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
          <mesh position={[1.75, 0.21, 0]}><boxGeometry args={[0.26, 0.08, 0.12]} /><meshBasicMaterial color="#ffd07a" toneMapped={false} /></mesh>
        </group>
      </group>
    </Selectable>
  )
}

export function MotorAssembly({ kind }: { kind: 'mg1' | 'mg2' }) {
  const rotor = useRef<Group>(null)
  const output = useSimulator((state) => state.telemetry)
  const isMg1 = kind === 'mg1'
  const position: [number, number, number] = isMg1 ? [-3.25, 0, 0] : [1.7, 0, 0]
  const rpm = isMg1 ? output.mg1Rpm : output.mg2Rpm
  useMechanicalMotion((rotationForRpm) => {
    if (rotor.current) rotor.current.rotation.x += rotationForRpm(rpm)
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
          <mesh position={[0.88, isMg1 ? 0.58 : 0.7, 0]}><boxGeometry args={[0.12, 0.08, 0.18]} /><meshBasicMaterial color={isMg1 ? '#e4d5ff' : '#baf8ff'} toneMapped={false} /></mesh>
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
  const selected = useSimulator((state) => state.selectedComponent === 'reduction')
  useMechanicalMotion((rotationForRpm) => {
    if (sun.current) sun.current.rotation.x += rotationForRpm(rpm)
    if (ring.current) ring.current.rotation.x += rotationForRpm(reductionRingRpm(rpm))
    planets.current.forEach((planet) => {
      planet.rotation.x += rotationForRpm(fixedCarrierPlanetRpm(rpm))
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
      {selected && <>
        <Line points={[[0, 0, 0], [0, 0.45, 0.9]]} color="#4ba8ff" lineWidth={1} />
        <Html position={[0, 0.45, 0.9]} center distanceFactor={12}><span className="gearset-label sun">SUN 22 · MG2</span></Html>
        <Line points={[[0, 0.76, 0], [0, 1.25, 0.65]]} color="#d4dde1" lineWidth={1} />
        <Html position={[0, 1.25, 0.65]} center distanceFactor={12}><span className="gearset-label">PLANETS · SELF-SPIN</span></Html>
        <Line points={[[0, -1.1, 0], [0, -1.42, 0.72]]} color="#50e5f2" lineWidth={1} />
        <Html position={[0, -1.42, 0.72]} center distanceFactor={12}><span className="gearset-label ring">RING 58 · OUTPUT</span></Html>
        <Line points={[[0, -0.35, 0], [0, -0.72, 0.92]]} color="#ff7277" lineWidth={1} />
        <Html position={[0, -0.72, 0.92]} center distanceFactor={12}><span className="gearset-label fixed">CARRIER · FIXED</span></Html>
      </>}
    </Selectable>
  )
}

export function DifferentialAssembly() {
  const diff = useRef<Group>(null)
  const finalDrivePinion = useRef<Group>(null)
  const wheelL = useRef<Group>(null)
  const wheelR = useRef<Group>(null)
  const rpm = useSimulator((state) => state.telemetry.wheelRpm)
  const cornering = useSimulator((state) => state.activeScenarioId === 'differential-cornering')
  useMechanicalMotion((rotationForRpm) => {
    if (diff.current) diff.current.rotation.x += rotationForRpm(rpm)
    if (finalDrivePinion.current) finalDrivePinion.current.rotation.x += rotationForRpm(-rpm * DRIVETRAIN.finalDriveRatio)
    if (wheelL.current) wheelL.current.rotation.z += rotationForRpm(rpm * (cornering ? 0.82 : 1))
    if (wheelR.current) wheelR.current.rotation.z += rotationForRpm(rpm * (cornering ? 1.18 : 1))
  })
  return (
    <group>
      <Selectable id="differential" position={[5.55, -0.25, 0]} explode={[1.2, 0, 0]} labelOffset={[0, 1.55, 0]}>
        <group ref={finalDrivePinion} position={[-0.82, 0, 0]}>
          <Gear radius={0.34} width={0.32} teeth={14} color="#8fa1a9" markerColor="#ffca72" />
        </group>
        <group rotation={[0, -Math.PI / 2, 0]}>
          <group ref={diff}>
            <Gear radius={0.96} width={0.28} teeth={38} color="#b7c0c4" markerColor="#58e7ff" />
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

function Shaft({ position, length, axis = 'x', active = false, color = '#8b9da5', radius = 0.075 }: { position: [number, number, number]; length: number; axis?: 'x' | 'z'; active?: boolean; color?: string; radius?: number }) {
  return (
    <mesh position={position} rotation={axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[active ? radius * 1.18 : radius, active ? radius * 1.18 : radius, length, 18]} />
      <meshStandardMaterial color={active ? '#dffaff' : color} emissive={active ? color : '#000000'} emissiveIntensity={active ? 0.72 : 0} metalness={0.92} roughness={0.18} />
    </mesh>
  )
}

export function MechanicalConnections() {
  const selected = useSimulator((state) => state.selectedComponent)
  const powerSplitActive = ['engine', 'carrier', 'planets', 'sun', 'mg1', 'ring'].includes(selected)
  const outputActive = ['ring', 'mg2', 'reduction', 'differential', 'wheels'].includes(selected)
  return (
    <group>
      <Shaft position={[-3.0, 0.13, 0]} length={2.8} active={powerSplitActive} color="#d88436" radius={0.11} />
      <Shaft position={[-2.18, -0.13, 0]} length={2.2} active={selected === 'sun' || selected === 'mg1'} color="#a986ff" radius={0.075} />
      <Shaft position={[0.15, 0.12, 0]} length={2.3} active={outputActive} color="#50e5f2" radius={0.10} />
      <Shaft position={[2.68, -0.12, 0]} length={1.95} active={selected === 'mg2' || selected === 'reduction'} color="#4ba8ff" radius={0.08} />
      <Shaft position={[4.72, -0.25, 0]} length={1.55} active={outputActive} color="#aab7bd" radius={0.08} />
      <Shaft position={[5.55, -0.25, -1.8]} length={2.8} axis="z" active={selected === 'differential' || selected === 'wheels'} color="#c8d0d4" radius={0.09} />
      <Shaft position={[5.55, -0.25, 1.8]} length={2.8} axis="z" active={selected === 'differential' || selected === 'wheels'} color="#c8d0d4" radius={0.09} />
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
