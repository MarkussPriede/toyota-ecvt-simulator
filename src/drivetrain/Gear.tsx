import { useMemo } from 'react'
import type { ColorRepresentation } from 'three'

interface GearProps {
  radius: number
  width?: number
  teeth?: number
  color?: ColorRepresentation
  inner?: boolean
  emissive?: ColorRepresentation
  opacity?: number
}

export function Gear({ radius, width = 0.32, teeth = 24, color = '#9ca6af', inner = false, emissive = '#000000', opacity = 1 }: GearProps) {
  const toothData = useMemo(() => Array.from({ length: teeth }, (_, index) => {
    const angle = (index / teeth) * Math.PI * 2
    const toothRadius = inner ? radius * 0.88 : radius * 0.96
    return { angle, y: Math.cos(angle) * toothRadius, z: Math.sin(angle) * toothRadius }
  }), [inner, radius, teeth])

  const material = {
    color,
    metalness: 0.86,
    roughness: 0.23,
    emissive,
    emissiveIntensity: emissive === '#000000' ? 0 : 0.35,
    transparent: opacity < 1,
    opacity,
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
      {toothData.map((tooth, index) => (
        <mesh
          key={index}
          position={[0, tooth.y, tooth.z]}
          rotation={[tooth.angle + Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, Math.max(0.08, (radius * Math.PI * 1.5) / teeth), radius * (inner ? 0.15 : 0.19)]} />
          <meshStandardMaterial {...material} />
        </mesh>
      ))}
      {!inner && (
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[radius * 0.25, radius * 0.25, width + 0.08, 32]} />
          <meshStandardMaterial color="#27303a" metalness={0.75} roughness={0.28} />
        </mesh>
      )}
    </group>
  )
}
