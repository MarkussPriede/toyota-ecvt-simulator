import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import { useSimulator } from '../state/useSimulator'

type Axis = 'x' | 'z'

function CircularArrow({ position, radius, rpm, color, axis = 'x' }: { position: [number, number, number]; radius: number; rpm: number; color: string; axis?: Axis }) {
  const reverse = rpm < 0
  const { points, head, quaternion } = useMemo(() => {
    const sign = reverse ? -1 : 1
    const path: [number, number, number][] = []
    let angle = 0
    for (let index = 0; index <= 28; index += 1) {
      angle = index / 34 * Math.PI * 2 * sign
      path.push(axis === 'x'
        ? [position[0], position[1] + Math.cos(angle) * radius, position[2] + Math.sin(angle) * radius]
        : [position[0] + Math.cos(angle) * radius, position[1] + Math.sin(angle) * radius, position[2]])
    }
    const tangent = axis === 'x'
      ? new Vector3(0, -Math.sin(angle) * sign, Math.cos(angle) * sign)
      : new Vector3(-Math.sin(angle) * sign, Math.cos(angle) * sign, 0)
    return {
      points: path,
      head: path[path.length - 1],
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tangent.normalize()),
    }
  }, [axis, position, radius, reverse])
  return (
    <group>
      <Line points={points} color={color} lineWidth={1.6} transparent opacity={0.86} />
      <mesh position={head} quaternion={quaternion}>
        <coneGeometry args={[0.095, 0.23, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Html position={[head[0], head[1] + 0.16, head[2]]} center distanceFactor={14}>
        <span className="rotation-label" style={{ color }}>{rpm < 0 ? '−' : '+'}</span>
      </Html>
    </group>
  )
}

export function RotationArrows() {
  const visible = useSimulator((state) => state.rotationArrows)
  const output = useSimulator((state) => state.telemetry)
  const selected = useSimulator((state) => state.selectedComponent)
  if (!visible) return null
  const powerSplitSelected = ['engine', 'mg1', 'sun', 'carrier', 'planets', 'ring'].includes(selected)
  const reductionSelected = selected === 'mg2' || selected === 'reduction'
  const outputSelected = selected === 'differential' || selected === 'wheels'
  return (
    <group>
      {powerSplitSelected && <CircularArrow position={[-6.1, 0, 0]} radius={1.45} rpm={output.engineRpm} color="#ff9a4d" />}
      {powerSplitSelected && <CircularArrow position={[-3.25, 0, 0]} radius={1.28} rpm={output.mg1Rpm} color="#a986ff" />}
      {(powerSplitSelected || outputSelected) && <CircularArrow position={[-1, 0, 0]} radius={1.52} rpm={output.ringRpm} color="#50e5f2" />}
      {reductionSelected && <CircularArrow position={[1.7, 0, 0]} radius={1.42} rpm={output.mg2Rpm} color="#4ba8ff" />}
      {reductionSelected && <CircularArrow position={[3.65, 0, 0]} radius={0.58} rpm={output.mg2Rpm} color="#4ba8ff" />}
      {reductionSelected && <CircularArrow position={[3.65, 0, 0]} radius={1.3} rpm={output.ringRpm} color="#50e5f2" />}
      {(reductionSelected || outputSelected) && <CircularArrow position={[5.55, -0.25, 0]} radius={1.25} rpm={output.wheelRpm} axis="z" color="#d8e4e8" />}
    </group>
  )
}
