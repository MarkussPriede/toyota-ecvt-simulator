import { Line } from '@react-three/drei'
import { useSimulator } from '../state/useSimulator'

function CircularArrow({ position, radius, reverse = false, color }: { position: [number, number, number]; radius: number; reverse?: boolean; color: string }) {
  const points: [number, number, number][] = []
  for (let i = 0; i <= 28; i++) {
    const a = (i / 34) * Math.PI * 2 * (reverse ? -1 : 1)
    points.push([position[0], position[1] + Math.cos(a) * radius, position[2] + Math.sin(a) * radius])
  }
  const end = points[points.length - 1]
  return (
    <group>
      <Line points={points} color={color} lineWidth={1.5} transparent opacity={0.85} />
      <mesh position={end} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.1, 0.24, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

export function RotationArrows() {
  const visible = useSimulator((state) => state.rotationArrows)
  const output = useSimulator((state) => state.telemetry)
  if (!visible) return null
  return (
    <group>
      <CircularArrow position={[-3.25, 0, 0]} radius={1.28} reverse={output.mg1Rpm < 0} color="#a986ff" />
      <CircularArrow position={[-1, 0, 0]} radius={1.55} reverse={output.ringRpm < 0} color="#50e5f2" />
      <CircularArrow position={[1.7, 0, 0]} radius={1.45} reverse={output.mg2Rpm < 0} color="#4ba8ff" />
    </group>
  )
}
