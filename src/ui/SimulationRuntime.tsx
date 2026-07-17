import { useEffect } from 'react'
import { useSimulator } from '../state/useSimulator'

export function SimulationRuntime() {
  const tick = useSimulator((state) => state.tick)
  useEffect(() => {
    let frame = 0
    let previous = performance.now()
    const loop = (now: number) => {
      tick((now - previous) / 1_000)
      previous = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [tick])
  return null
}
