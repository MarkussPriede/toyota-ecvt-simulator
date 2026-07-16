import { Canvas } from '@react-three/fiber'
import { Crosshair, Maximize2, Rotate3D } from 'lucide-react'
import { DrivetrainScene } from '../scenes/DrivetrainScene'
import { useSimulator } from '../state/useSimulator'
import type { CameraPreset } from '../simulation/types'

const VIEWS: { id: CameraPreset; label: string }[] = [
  { id: 'drivetrain', label: 'Full' }, { id: 'planetary', label: 'Power split' }, { id: 'mg1', label: 'MG1' },
  { id: 'mg2', label: 'MG2' }, { id: 'differential', label: 'Differential' }, { id: 'electrical', label: 'Electrical' },
]

export function SceneViewport() {
  const cameraPreset = useSimulator((state) => state.cameraPreset)
  const setCameraPreset = useSimulator((state) => state.setCameraPreset)
  const quality = useSimulator((state) => state.quality)
  const setQuality = useSimulator((state) => state.setQuality)
  return (
    <main className="viewport" aria-label="Interactive 3D hybrid transaxle">
      <Canvas
        camera={{ position: [13, 8, 14], fov: 40, near: 0.1, far: 80 }}
        dpr={quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : 1}
        gl={{ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' }}
        shadows={quality !== 'low'}
      >
        <DrivetrainScene />
      </Canvas>
      <div className="view-toolbar" role="group" aria-label="Camera preset views">
        <span><Crosshair size={14} /> View</span>
        {VIEWS.map((view) => <button key={view.id} className={cameraPreset === view.id ? 'active' : ''} aria-pressed={cameraPreset === view.id} onClick={() => setCameraPreset(view.id)}>{view.label}</button>)}
      </div>
      <div className="viewport-hint"><Rotate3D size={15} /> Drag to orbit · scroll to zoom · right-drag to pan</div>
      <label className="quality-control"><Maximize2 size={14} /> <select value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <div className="energy-legend" aria-label="Energy flow colour legend">
        <span><i className="engine" /> Engine mechanical</span>
        <span><i className="battery" /> Battery use</span>
        <span><i className="regen" /> Regeneration</span>
        <span><i className="mg1" /> MG1 electrical</span>
        <span><i className="mg2" /> MG2 output</span>
      </div>
    </main>
  )
}
