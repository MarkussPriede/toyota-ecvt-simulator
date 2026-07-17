import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ElementRef } from 'react'
import { Vector3 } from 'three'
import { useSimulator } from '../state/useSimulator'

const VIEWS = {
  drivetrain: { camera: [13, 8, 14], target: [0, 0.4, 0] },
  planetary: { camera: [5.8, 3.2, 6.8], target: [-1, 0, 0] },
  mg1: { camera: [1.8, 2.7, 6.2], target: [-3.25, 0, 0] },
  mg2: { camera: [8.3, 3.0, 6.5], target: [3.15, 0, 0] },
  differential: { camera: [10.5, 3.8, 7.5], target: [5.4, -0.2, 0] },
  electrical: { camera: [7.0, 8.4, 9.6], target: [0.8, 2.2, -1.5] },
} as const

export function CameraRig() {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null)
  const preset = useSimulator((state) => state.cameraPreset)
  const { camera, size } = useThree()
  const progress = useRef(1)
  const fromCamera = useRef(new Vector3())
  const fromTarget = useRef(new Vector3())

  useEffect(() => {
    fromCamera.current.copy(camera.position)
    fromTarget.current.copy(controls.current?.target ?? new Vector3())
    progress.current = 0
  }, [camera, preset, size.height, size.width])

  useFrame((_, delta) => {
    if (!controls.current || progress.current >= 1) return
    progress.current = Math.min(1, progress.current + delta * 1.45)
    const eased = 1 - Math.pow(1 - progress.current, 3)
    const view = VIEWS[preset]
    const target = new Vector3(...view.target)
    const destination = new Vector3(...view.camera)
    // Portrait canvases have a much narrower horizontal field of view. Pull the
    // camera back so the drivetrain and its labels remain visible on phones.
    const aspect = size.width / Math.max(size.height, 1)
    const fit = Math.min(1.6, Math.max(1, 1.25 / aspect))
    destination.sub(target).multiplyScalar(fit).add(target)
    camera.position.lerpVectors(fromCamera.current, destination, eased)
    controls.current.target.lerpVectors(fromTarget.current, target, eased)
    controls.current.update()
  })

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={3.2} maxDistance={28} maxPolarAngle={Math.PI * 0.82} />
}
