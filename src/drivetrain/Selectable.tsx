import { Html, Line } from '@react-three/drei'
import { useEffect, useRef, type PropsWithChildren } from 'react'
import type { Group } from 'three'
import { COMPONENTS } from '../data/components'
import type { CameraPreset, ComponentId } from '../simulation/types'
import { useSimulator } from '../state/useSimulator'
import { useDrivetrainAnchors } from '../scenes/DrivetrainAnchors'

const COMPONENT_VIEW: Record<ComponentId, CameraPreset> = {
  engine: 'drivetrain', mg1: 'mg1', mg2: 'mg2', sun: 'planetary', carrier: 'planetary', planets: 'planetary',
  ring: 'planetary', reduction: 'mg2', differential: 'differential', wheels: 'differential', battery: 'electrical', inverter: 'electrical',
}

export const IMMEDIATE_CONNECTIONS: Partial<Record<ComponentId, ComponentId[]>> = {
  engine: ['carrier'], carrier: ['engine', 'planets', 'sun', 'ring'], planets: ['carrier', 'sun', 'ring'], sun: ['planets', 'mg1', 'carrier'],
  ring: ['planets', 'carrier', 'sun'], mg1: ['sun', 'inverter'], mg2: ['reduction', 'inverter'], reduction: ['mg2', 'ring', 'differential'],
  differential: ['reduction', 'wheels'], wheels: ['differential'], battery: ['inverter'], inverter: ['battery', 'mg1', 'mg2'],
}

interface Props extends PropsWithChildren {
  id: ComponentId
  position: [number, number, number]
  explode?: [number, number, number]
  labelOffset?: [number, number, number]
}

export function Selectable({ id, position, explode = [0, 0, 0], labelOffset = [0, 1.1, 0], children }: Props) {
  const root = useRef<Group>(null)
  const registry = useDrivetrainAnchors()
  const exploded = useSimulator((state) => state.exploded)
  const labels = useSimulator((state) => state.labels)
  const selected = useSimulator((state) => state.selectedComponent)
  const setSelected = useSimulator((state) => state.setSelectedComponent)
  const setCameraPreset = useSimulator((state) => state.setCameraPreset)
  const x = position[0] + explode[0] * exploded
  const y = position[1] + explode[1] * exploded
  const z = position[2] + explode[2] * exploded
  const immediate = (IMMEDIATE_CONNECTIONS[selected] ?? []).includes(id)
  const showLabel = labels && (selected === id || immediate)

  useEffect(() => {
    registry?.register(id, root.current)
    return () => registry?.register(id, null)
  }, [id, registry])

  return (
    <group
      ref={root}
      position={[x, y, z]}
      scale={selected === id ? 1.035 : 1}
      onClick={(event) => { event.stopPropagation(); setSelected(id) }}
      onDoubleClick={(event) => { event.stopPropagation(); setSelected(id); setCameraPreset(COMPONENT_VIEW[id]) }}
    >
      {children}
      <mesh rotation={[0, Math.PI / 2, 0]} scale={selected === id ? 1.08 : immediate ? 1 : 0.94}>
        <torusGeometry args={[1.05, selected === id ? 0.025 : 0.012, 8, 64]} />
        <meshBasicMaterial
          color={selected === id ? '#65e6ff' : '#7aa7b4'}
          transparent
          opacity={selected === id ? 0.9 : immediate ? 0.26 : 0.035}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {showLabel && <Line points={[[0, 0, 0], labelOffset]} color={selected === id ? '#65e6ff' : '#6e929d'} lineWidth={1} transparent opacity={selected === id ? 0.75 : 0.38} />}
      {showLabel && (
        <Html position={labelOffset} center distanceFactor={12} zIndexRange={[5, 0]}>
          <button className={`scene-label ${selected === id ? 'is-selected' : ''}`} onClick={() => setSelected(id)}>
            <span>{COMPONENTS[id].name}</span>
          </button>
        </Html>
      )}
    </group>
  )
}
