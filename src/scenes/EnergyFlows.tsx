import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Color, InstancedMesh, Object3D, Vector3 } from 'three'
import { useSimulator } from '../state/useSimulator'
import type { ComponentId, FlowId, FlowKind } from '../simulation/types'

const COLORS: Record<FlowKind, string> = {
  engine: '#ff8b38', battery: '#4ba8ff', regen: '#4ee39b', mg1: '#a986ff', mg2: '#50e5f2', loss: '#ff666b',
}

const LAYOUT: Record<ComponentId, { position: [number, number, number]; explode: [number, number, number] }> = {
  engine: { position: [-6.1, 0, 0], explode: [-1.3, 0, 0] },
  mg1: { position: [-3.25, 0, 0], explode: [-0.8, 0, 0] },
  mg2: { position: [1.7, 0, 0], explode: [0.9, 0, 0] },
  sun: { position: [-1, 0, 0], explode: [-0.55, 0, 0] },
  carrier: { position: [-1, 0, 0], explode: [0.62, 0, 0] },
  planets: { position: [-1, 0, 0], explode: [0.62, 0, 0] },
  ring: { position: [-1, 0, 0], explode: [0.3, 0, 0] },
  reduction: { position: [3.65, 0, 0], explode: [1.05, 0, 0] },
  differential: { position: [5.55, -0.25, 0], explode: [1.2, 0, 0] },
  wheels: { position: [5.55, -0.25, 0], explode: [1.5, 0, 0] },
  battery: { position: [-0.3, 3.25, -2.7], explode: [0, 1, -0.7] },
  inverter: { position: [2.6, 2.75, -2.25], explode: [0.5, 1.1, -0.8] },
}

type Anchor = [ComponentId, [number, number, number]]

const ROUTES: Record<FlowId, Anchor[]> = {
  'engine-planetary': [['engine', [1.15, .55, .65]], ['engine', [1.8, .65, .65]], ['carrier', [-.6, .8, .55]], ['carrier', [0, .65, .5]]],
  'planetary-output': [['ring', [.4, -.7, .55]], ['mg2', [-.2, -1.25, .55]], ['reduction', [0, -1.25, .45]], ['differential', [-.2, -.7, .35]]],
  'output-wheels': [['reduction', [.2, -1.2, .4]], ['differential', [0, -.8, .35]], ['wheels', [0, -.5, 2.9]], ['wheels', [0, 0, 3.5]]],
  'battery-inverter': [['battery', [.3, .25, .65]], ['battery', [1.5, .45, .5]], ['inverter', [-.9, .2, .4]], ['inverter', [0, 0, .5]]],
  'inverter-mg2': [['inverter', [0, 0, .5]], ['inverter', [.2, -.8, .5]], ['mg2', [.2, .7, .4]], ['mg2', [0, .4, .5]]],
  'mg1-inverter': [['mg1', [0, .7, -.6]], ['mg1', [.4, 1.4, -.8]], ['inverter', [-.7, -.4, .4]], ['inverter', [0, 0, .5]]],
  'inverter-mg1': [['inverter', [0, 0, .5]], ['inverter', [-.7, -.4, .4]], ['mg1', [.4, 1.4, -.8]], ['mg1', [0, .7, -.6]]],
  'mg1-engine': [['mg1', [-.4, .55, .55]], ['mg1', [-.9, .7, .55]], ['engine', [1.5, .7, .55]], ['engine', [.9, .45, .45]]],
  'wheels-mg2': [['wheels', [0, 0, 3.5]], ['wheels', [0, -.5, 2.9]], ['differential', [0, -.8, .35]], ['reduction', [0, -1.2, .4]], ['mg2', [.3, -.6, .4]]],
  'inverter-battery': [['inverter', [0, 0, .5]], ['inverter', [-.9, .2, .4]], ['battery', [1.5, .45, .5]], ['battery', [.3, .25, .65]]],
  'drivetrain-engine': [['wheels', [0, 0, 3.5]], ['differential', [0, -.8, .35]], ['ring', [.4, -.7, .55]], ['engine', [1.15, .55, .65]]],
  'friction-brakes': [['differential', [0, -.4, 0]], ['wheels', [0, -.4, 2.8]], ['wheels', [0, 0, 3.5]]],
}

function resolveAnchor([component, local]: Anchor, exploded: number) {
  const layout = LAYOUT[component]
  return new Vector3(
    layout.position[0] + layout.explode[0] * exploded + local[0],
    layout.position[1] + layout.explode[1] * exploded + local[1],
    layout.position[2] + layout.explode[2] * exploded + local[2],
  )
}

interface FlowPathProps {
  id: FlowId
  kind: FlowKind
  powerKw: number
  direction: 1 | -1
  instanceIndex: number
}

function FlowPath({ id, kind, powerKw, direction, instanceIndex }: FlowPathProps) {
  const exploded = useSimulator((state) => state.exploded)
  const running = useSimulator((state) => state.running)
  const timeScale = useSimulator((state) => state.timeScale)
  const curve = useMemo(() => {
    const offset = instanceIndex * 0.045
    const points = ROUTES[id].map((anchor) => resolveAnchor(anchor, exploded).add(new Vector3(0, offset, offset)))
    return new CatmullRomCurve3(points)
  }, [exploded, id, instanceIndex])
  const movers = useRef<InstancedMesh>(null)
  const phase = useRef(0)
  const dummy = useMemo(() => new Object3D(), [])
  const speed = 0.1 + Math.min(powerKw / 60, 1) * 0.25
  const color = useMemo(() => new Color(COLORS[kind]), [kind])
  const radius = 0.018 + Math.min(powerKw / 60, 1) * 0.022
  const particleCount = 6

  useFrame((_, delta) => {
    if (!running || !movers.current) return
    phase.current = (phase.current + delta * speed * direction * timeScale + 1) % 1
    for (let index = 0; index < particleCount; index += 1) {
      const t = (phase.current + index / particleCount + 1) % 1
      dummy.position.copy(curve.getPointAt(t))
      dummy.updateMatrix()
      movers.current.setMatrixAt(index, dummy.matrix)
    }
    movers.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 48, radius, 7, false]} />
        <meshBasicMaterial color={color} transparent opacity={0.36} depthWrite={false} toneMapped={false} />
      </mesh>
      <instancedMesh ref={movers} args={[undefined, undefined, particleCount]}>
        <sphereGeometry args={[radius * 2.2, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

export function EnergyFlows() {
  const visible = useSimulator((state) => state.energyArrows)
  const flows = useSimulator((state) => state.telemetry.energyFlows)
  if (!visible) return null
  const idCounts = new Map<FlowId, number>()
  return (
    <group>
      {flows.map((flow) => {
        const index = idCounts.get(flow.id) ?? 0
        idCounts.set(flow.id, index + 1)
        return <FlowPath key={`${flow.id}-${flow.kind}-${index}`} {...flow} instanceIndex={index} />
      })}
    </group>
  )
}
