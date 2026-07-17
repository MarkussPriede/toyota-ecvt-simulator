import { useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D, type ColorRepresentation } from 'three'

interface GearProps {
  radius: number
  width?: number
  teeth?: number
  color?: ColorRepresentation
  inner?: boolean
  emissive?: ColorRepresentation
  opacity?: number
  markerColor?: ColorRepresentation
}

export function Gear({ radius, width = 0.32, teeth = 24, color = '#9ca6af', inner = false, emissive = '#000000', opacity = 1, markerColor = '#ffca72' }: GearProps) {
  const teethMesh = useRef<InstancedMesh>(null)
  const toothDepth = radius * (inner ? 0.15 : 0.19)
  const toothLength = Math.max(0.08, radius * Math.PI * 1.5 / teeth)
  const toothRadius = inner ? radius * 0.88 : radius * 0.96
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    if (!teethMesh.current) return
    for (let index = 0; index < teeth; index += 1) {
      const angle = index / teeth * Math.PI * 2
      dummy.position.set(0, Math.cos(angle) * toothRadius, Math.sin(angle) * toothRadius)
      dummy.rotation.set(angle + Math.PI / 2, 0, 0)
      dummy.updateMatrix()
      teethMesh.current.setMatrixAt(index, dummy.matrix)
    }
    teethMesh.current.instanceMatrix.needsUpdate = true
  }, [dummy, teeth, toothRadius])

  const material = {
    color, metalness: 0.86, roughness: 0.23, emissive,
    emissiveIntensity: emissive === '#000000' ? 0 : 0.35,
    transparent: opacity < 1, opacity,
  }

  return (
    <group>
      {inner ? (
        <mesh rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
          <torusGeometry args={[radius, width * 0.58, 12, 64]} />
          <meshStandardMaterial {...material} />
        </mesh>
      ) : (
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[radius * 0.74, radius * 0.74, width, 48]} />
          <meshStandardMaterial {...material} />
        </mesh>
      )}
      <instancedMesh ref={teethMesh} args={[undefined, undefined, teeth]} castShadow receiveShadow>
        <boxGeometry args={[width, toothLength, toothDepth]} />
        <meshStandardMaterial {...material} />
      </instancedMesh>
      {!inner && (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[radius * 0.25, radius * 0.25, width + 0.08, 32]} />
          <meshStandardMaterial color="#27303a" metalness={0.75} roughness={0.28} />
        </mesh>
      )}
      <mesh position={[width * 0.55, toothRadius, 0]}>
        <boxGeometry args={[0.045, Math.max(0.08, toothLength * 0.72), Math.max(0.08, toothDepth * 0.72)]} />
        <meshBasicMaterial color={markerColor} toneMapped={false} />
      </mesh>
    </group>
  )
}
