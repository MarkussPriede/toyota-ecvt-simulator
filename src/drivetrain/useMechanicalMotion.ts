import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { VISUAL_RPM_SCALE } from '../simulation/constants'
import { useSimulator } from '../state/useSimulator'
import { steppedRotation } from './visualMechanics'

export function useMechanicalMotion(callback: (rotationForRpm: (rpm: number) => number) => void) {
  const running = useSimulator((state) => state.running)
  const visualSpeed = useSimulator((state) => state.visualSpeed)
  const visualStep = useSimulator((state) => state.visualStep)
  const previousStep = useRef(visualStep)

  useFrame((_, delta) => {
    const steps = visualStep - previousStep.current
    previousStep.current = visualStep
    const continuousScale = running ? Math.min(delta, 0.05) * visualSpeed * VISUAL_RPM_SCALE : 0
    if (continuousScale === 0 && steps === 0) return
    callback((rpm) => steppedRotation(rpm, continuousScale, steps))
  })
}
