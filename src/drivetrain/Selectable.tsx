import { Html } from '@react-three/drei'
import { useEffect, useRef, type PropsWithChildren } from 'react'
import type { Group, Material, Mesh } from 'three'
import { useSimulator } from '../state/useSimulator'
import { COMPONENTS } from '../data/components'
import type { CameraPreset, ComponentId } from '../simulation/types'

const COMPONENT_VIEW: Record<ComponentId, CameraPreset> = {
  engine: 'drivetrain',
  mg1: 'mg1',
  mg2: 'mg2',
  sun: 'planetary',
  carrier: 'planetary',
  planets: 'planetary',
  ring: 'planetary',
  reduction: 'mg2',
  differential: 'differential',
  wheels: 'differential',
  battery: 'electrical',
  inverter: 'electrical',
}

interface Props extends PropsWithChildren {
  id: ComponentId
  position: [number, number, number]
  explode?: [number, number, number]
  labelOffset?: [number, number, number]
}

export function Selectable({ id, position, explode = [0, 0, 0], labelOffset = [0, 1.1, 0], children }: Props) {
  const content = useRef<Group>(null)
  const originalMaterials = useRef(new Map<Material, { opacity: number; transparent: boolean; depthWrite: boolean }>())
  const exploded = useSimulator((state) => state.exploded)
  const labels = useSimulator((state) => state.labels)
  const selected = useSimulator((state) => state.selectedComponent)
  const tutorialActive = useSimulator((state) => state.tutorialActive)
  const setSelected = useSimulator((state) => state.setSelectedComponent)
  const setCameraPreset = useSimulator((state) => state.setCameraPreset)
  const x = position[0] + explode[0] * exploded
  const y = position[1] + explode[1] * exploded
  const z = position[2] + explode[2] * exploded
  const dimmed = tutorialActive && selected !== id

  useEffect(() => {
    content.current?.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.material) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach((material) => {
        if (!originalMaterials.current.has(material)) {
          originalMaterials.current.set(material, {
            opacity: material.opacity,
            transparent: material.transparent,
            depthWrite: material.depthWrite,
          })
        }
        const original = originalMaterials.current.get(material)!
        material.opacity = dimmed ? Math.min(original.opacity, 0.16) : original.opacity
        material.transparent = dimmed || original.transparent
        material.depthWrite = dimmed ? false : original.depthWrite
        material.needsUpdate = true
      })
    })
  }, [dimmed])

  return (
    <group
      position={[x, y, z]}
      scale={selected === id ? 1.035 : 1}
      onClick={(event) => { event.stopPropagation(); setSelected(id) }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        setSelected(id)
        setCameraPreset(COMPONENT_VIEW[id])
      }}
    >
      <group ref={content} scale={dimmed ? 0.98 : 1}>{children}</group>
      {selected === id && (
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[1.05, 0.018, 8, 64]} />
          <meshBasicMaterial color="#65e6ff" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      )}
      {labels && (!tutorialActive || selected === id) && (
        <Html position={labelOffset} center distanceFactor={12} zIndexRange={[5, 0]}>
          <button className={`scene-label ${selected === id ? 'is-selected' : ''}`} onClick={() => setSelected(id)}>
            <span>{COMPONENTS[id].name}</span>
          </button>
        </Html>
      )}
    </group>
  )
}
