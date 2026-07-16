import { RoundedBox } from '@react-three/drei'
import { useSimulator } from '../state/useSimulator'

export function TransmissionHousing() {
  const opacity = useSimulator((state) => state.housingOpacity)
  const exploded = useSimulator((state) => state.exploded)
  return (
    <group position={[0, -0.08 + exploded * 2.2, 0]}>
      <RoundedBox args={[8.8, 3.4, 3.4]} radius={0.55} smoothness={6} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#9bacb4"
          metalness={0.72}
          roughness={0.24}
          transmission={Math.max(0.05, 1 - opacity)}
          transparent
          opacity={opacity}
          thickness={0.6}
          clearcoat={0.55}
          clearcoatRoughness={0.2}
          side={2}
          depthWrite={opacity > 0.32}
        />
      </RoundedBox>
      <mesh position={[-4.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.34, 0.16, 12, 64]} />
        <meshStandardMaterial color="#a8b4ba" metalness={0.8} roughness={0.25} transparent opacity={Math.min(1, opacity + 0.22)} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2
        return (
          <mesh key={i} position={[-4.25, Math.cos(angle) * 1.38, Math.sin(angle) * 1.38]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.09, 0.09, 0.22, 12]} />
            <meshStandardMaterial color="#c4ccd0" metalness={0.9} roughness={0.18} />
          </mesh>
        )
      })}
    </group>
  )
}
