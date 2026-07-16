import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Color, Mesh, Vector3 } from 'three'
import { useSimulator } from '../state/useSimulator'
import type { FlowId, FlowKind } from '../simulation/types'

const COLORS: Record<FlowKind, string> = {
  engine: '#ff8b38',
  battery: '#4ba8ff',
  regen: '#4ee39b',
  mg1: '#a986ff',
  mg2: '#50e5f2',
}

const PATHS: Record<FlowId, [number, number, number][]> = {
  'engine-planetary': [[-5.2, 0.55, 0.7], [-3.8, 1.15, 0.75], [-1.2, 1.35, 0.65], [-1.0, 0.85, 0.5]],
  'planetary-output': [[-0.5, -0.8, 0.6], [1.2, -1.4, 0.7], [3.7, -1.35, 0.5], [5.4, -0.9, 0.4]],
  'output-wheels': [[3.9, -1.35, 0.45], [5.4, -1.5, 0.4], [5.55, -1.1, 2.4], [5.55, -0.3, 3.5]],
  'battery-inverter': [[-0.3, 3.2, -2.0], [0.8, 3.7, -1.8], [2.5, 3.35, -1.65], [2.6, 2.8, -1.5]],
  'inverter-mg2': [[2.6, 2.65, -1.5], [2.9, 1.55, -1.1], [2.4, 0.7, -0.8], [1.8, 0.4, -0.7]],
  'mg1-inverter': [[-3.2, 0.75, -0.75], [-2.5, 1.65, -1.2], [0.2, 2.1, -1.4], [2.5, 2.65, -1.5]],
  'wheels-mg2': [[5.55, -0.3, 3.5], [5.55, -1.1, 2.4], [4.7, -1.4, 0.6], [2.0, -0.7, -0.5]],
  'inverter-battery': [[2.6, 2.8, -1.5], [2.5, 3.35, -1.65], [0.8, 3.7, -1.8], [-0.3, 3.2, -2.0]],
}

interface FlowPathProps {
  id: FlowId
  kind: FlowKind
  powerKw: number
  direction: 1 | -1
}

function FlowPath({ id, kind, powerKw, direction }: FlowPathProps) {
  const points = PATHS[id]
  const curve = useMemo(() => new CatmullRomCurve3(points.map((point) => new Vector3(...point))), [points])
  const movers = useRef<Mesh[]>([])
  const phase = useRef(0)
  const speed = 0.12 + Math.min(powerKw / 60, 1) * 0.24
  const color = new Color(COLORS[kind])
  const radius = 0.018 + Math.min(powerKw / 60, 1) * 0.022

  useFrame((_, delta) => {
    phase.current = (phase.current + delta * speed * direction + 1) % 1
    movers.current.forEach((mesh, index) => {
      const t = (phase.current + index / movers.current.length + 1) % 1
      mesh.position.copy(curve.getPointAt(t))
    })
  })

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 48, radius, 8, false]} />
        <meshBasicMaterial color={color} transparent opacity={0.36} depthWrite={false} toneMapped={false} />
      </mesh>
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index} ref={(node) => { if (node) movers.current[index] = node }}>
          <sphereGeometry args={[radius * 2.25, 12, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
          <pointLight color={color} intensity={powerKw > 20 ? 0.25 : 0.1} distance={0.8} />
        </mesh>
      ))}
    </group>
  )
}

export function EnergyFlows() {
  const visible = useSimulator((state) => state.energyArrows)
  const flows = useSimulator((state) => state.output.energyFlows)
  if (!visible) return null
  return <group>{flows.map((flow) => <FlowPath key={flow.id} {...flow} />)}</group>
}
