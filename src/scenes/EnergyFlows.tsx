import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import type { ComponentId, FlowId, FlowKind } from '../simulation/types'
import { useSimulator } from '../state/useSimulator'
import { useDrivetrainAnchors } from './DrivetrainAnchors'

const COLORS: Record<FlowKind, string> = {
  engine: '#ff8b38', battery: '#4ba8ff', regen: '#4ee39b', mg1: '#a986ff', mg2: '#50e5f2', loss: '#ff666b',
}

type Anchor = [ComponentId, [number, number, number]]

const ROUTES: Record<FlowId, Anchor[]> = {
  'engine-planetary': [['engine', [1.0, .58, .62]], ['carrier', [0, .64, .52]]],
  'planetary-output': [['ring', [.35, -.72, .54]], ['reduction', [-.25, -.95, .45]], ['differential', [-.2, -.68, .35]]],
  'output-wheels': [['differential', [0, -.68, .35]], ['wheels', [0, -.45, 2.95]], ['wheels', [0, 0, 3.5]]],
  'battery-inverter': [['battery', [.3, .25, .65]], ['inverter', [0, 0, .55]]],
  'inverter-mg2': [['inverter', [0, 0, .55]], ['mg2', [0, .48, .5]]],
  'mg1-inverter': [['mg1', [0, .7, -.6]], ['inverter', [0, 0, .55]]],
  'inverter-mg1': [['inverter', [0, 0, .55]], ['mg1', [0, .7, -.6]]],
  'mg1-engine': [['mg1', [-.4, .55, .55]], ['engine', [.9, .48, .48]]],
  'wheels-mg2': [['wheels', [0, 0, 3.5]], ['differential', [0, -.68, .35]], ['reduction', [0, -.95, .42]], ['mg2', [.3, -.58, .42]]],
  'inverter-battery': [['inverter', [0, 0, .55]], ['battery', [.3, .25, .65]]],
  'drivetrain-engine': [['wheels', [0, 0, 3.5]], ['differential', [0, -.68, .35]], ['ring', [.35, -.72, .54]], ['engine', [1.0, .58, .62]]],
  'friction-brakes': [['differential', [0, -.4, 0]], ['wheels', [0, -.4, 2.9]], ['wheels', [0, 0, 3.5]]],
}

interface FlowPathProps {
  id: FlowId
  kind: FlowKind
  powerKw: number
  direction: 1 | -1
  instanceIndex: number
}

function FlowPath({ id, kind, powerKw, direction, instanceIndex }: FlowPathProps) {
  const anchors = useDrivetrainAnchors()
  const running = useSimulator((state) => state.running)
  const visualSpeed = useSimulator((state) => state.visualSpeed)
  const visualStep = useSimulator((state) => state.visualStep)
  const root = useRef<Group>(null)
  const lineGeometry = useRef<BufferGeometry>(null)
  const movers = useRef<InstancedMesh>(null)
  const previousStep = useRef(visualStep)
  const phase = useRef(0)
  const initialized = useRef(false)
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(COLORS[kind]), [kind])
  const linePositions = useMemo(() => new Float32Array(49 * 3), [])
  const linePositionAttribute = useMemo(() => new Float32BufferAttribute(linePositions, 3), [linePositions])
  const speed = 0.1 + Math.min(powerKw / 60, 1) * 0.25
  const radius = 0.026 + Math.min(powerKw / 60, 1) * 0.025
  const particleCount = 6

  useFrame((_, delta) => {
    if (!anchors || !root.current || !lineGeometry.current || !movers.current) return
    root.current.updateWorldMatrix(true, false)
    const route = ROUTES[id]
    const points: Vector3[] = []
    for (const [component, local] of route) {
      const object = anchors.objects.get(component)
      if (!object) return
      object.updateWorldMatrix(true, false)
      const point = object.localToWorld(new Vector3(...local))
      root.current.worldToLocal(point)
      point.y += instanceIndex * 0.045
      point.z += instanceIndex * 0.045
      points.push(point)
    }
    if (points.length === 2) {
      const midpoint = points[0].clone().lerp(points[1], 0.5)
      midpoint.y += Math.min(0.8, points[0].distanceTo(points[1]) * 0.12)
      points.splice(1, 0, midpoint)
    }
    const curve = new CatmullRomCurve3(points)
    const samples = curve.getPoints(48)
    samples.forEach((point, index) => linePositionAttribute.setXYZ(index, point.x, point.y, point.z))
    linePositionAttribute.needsUpdate = true
    lineGeometry.current.computeBoundingSphere()

    const stepDelta = visualStep - previousStep.current
    previousStep.current = visualStep
    if (running) phase.current = (phase.current + delta * speed * direction * visualSpeed + 1) % 1
    if (stepDelta !== 0) phase.current = (phase.current + stepDelta * direction / particleCount + 1) % 1
    // Matrix initialization is intentionally outside the running guard, so paused paths never show particles at the origin.
    if (running || stepDelta !== 0 || !initialized.current) {
      for (let index = 0; index < particleCount; index += 1) {
        const t = (phase.current + index / particleCount + 1) % 1
        dummy.position.copy(curve.getPointAt(t))
        dummy.updateMatrix()
        movers.current.setMatrixAt(index, dummy.matrix)
      }
      movers.current.instanceMatrix.needsUpdate = true
      initialized.current = true
    }
  })

  return (
    <group ref={root}>
      <line>
        <bufferGeometry ref={lineGeometry}>
          <primitive attach="attributes-position" object={linePositionAttribute} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </line>
      <instancedMesh ref={movers} args={[undefined, undefined, particleCount]}>
        <sphereGeometry args={[radius, 8, 8]} />
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
