import { RoundedBox } from '@react-three/drei'
import { useSimulator } from '../state/useSimulator'

function ShellPanel({ position, size, opacity }: { position: [number, number, number]; size: [number, number, number]; opacity: number }) {
  return (
    <RoundedBox position={position} args={size} radius={0.14} smoothness={3} castShadow receiveShadow>
      <meshPhysicalMaterial
        color="#91a3ac"
        metalness={0.74}
        roughness={0.27}
        transparent
        opacity={Math.max(0.12, opacity)}
        clearcoat={0.45}
        clearcoatRoughness={0.24}
        depthWrite={opacity > 0.28}
      />
    </RoundedBox>
  )
}

export function TransmissionHousing() {
  const opacity = useSimulator((state) => state.housingOpacity)
  const exploded = useSimulator((state) => state.exploded)
  return (
    <group position={[0, -0.08 + exploded * 0.35, -exploded * 3.2]}>
      {/* Deliberately open at the front and top: these are real shell sections, not a closed transparent box. */}
      <ShellPanel position={[0, 0, -1.72]} size={[8.8, 3.4, 0.18]} opacity={opacity} />
      <ShellPanel position={[0, -1.72, -0.45]} size={[8.8, 0.18, 2.7]} opacity={opacity} />
      <ShellPanel position={[-4.4, -0.4, -0.45]} size={[0.18, 2.7, 2.7]} opacity={opacity} />
      <ShellPanel position={[4.4, -0.4, -0.45]} size={[0.18, 2.7, 2.7]} opacity={opacity} />
      {[-3.1, -1.45, 0.2, 1.85, 3.5].map((x) => (
        <mesh key={x} position={[x, -0.1, -1.62]}>
          <torusGeometry args={[1.38, 0.055, 8, 48, Math.PI * 1.52]} />
          <meshStandardMaterial color="#b1bdc2" metalness={0.84} roughness={0.24} transparent opacity={Math.min(0.72, opacity + 0.22)} />
        </mesh>
      ))}
      <mesh position={[-4.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.34, 0.16, 12, 64, Math.PI * 1.65]} />
        <meshStandardMaterial color="#a8b4ba" metalness={0.8} roughness={0.25} transparent opacity={Math.min(1, opacity + 0.22)} />
      </mesh>
    </group>
  )
}
