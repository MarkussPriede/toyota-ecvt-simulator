import { Canvas } from '@react-three/fiber'
import { Box, Crosshair, Maximize2, Rotate3D, Waypoints } from 'lucide-react'
import { DrivetrainScene } from '../scenes/DrivetrainScene'
import { useSimulator } from '../state/useSimulator'
import type { CameraPreset, ComponentId } from '../simulation/types'
import { TeachingSchematic } from './TeachingSchematic'

const VIEWS: { id: CameraPreset; label: string; component?: ComponentId }[] = [
  { id: 'drivetrain', label: 'Full' }, { id: 'planetary', label: 'Power split', component: 'ring' }, { id: 'mg1', label: 'MG1', component: 'mg1' },
  { id: 'mg2', label: 'MG2 reduction', component: 'reduction' }, { id: 'differential', label: 'Differential', component: 'differential' }, { id: 'electrical', label: 'Electrical', component: 'inverter' },
]

function webGlAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

export function SceneViewport() {
  const visualMode = useSimulator((state) => state.visualMode)
  const setVisualMode = useSimulator((state) => state.setVisualMode)
  const cameraPreset = useSimulator((state) => state.cameraPreset)
  const setCameraPreset = useSimulator((state) => state.setCameraPreset)
  const setSelectedComponent = useSimulator((state) => state.setSelectedComponent)
  const quality = useSimulator((state) => state.quality)
  const setQuality = useSimulator((state) => state.setQuality)
  const hasWebGl = webGlAvailable()
  return (
    <main className={`viewport ${visualMode === 'schematic' ? 'schematic-viewport' : ''}`} aria-label="Interactive hybrid transaxle">
      <div className="visual-mode-switch" role="group" aria-label="Visual teaching mode">
        <button className={visualMode === 'schematic' ? 'active' : ''} onClick={() => setVisualMode('schematic')}><Waypoints size={15} /> Teaching schematic</button>
        <button className={visualMode === 'cutaway' ? 'active' : ''} disabled={!hasWebGl} title={!hasWebGl ? 'WebGL 2 is unavailable; the teaching schematic remains fully usable.' : undefined} onClick={() => setVisualMode('cutaway')}><Box size={15} /> 3D cutaway</button>
      </div>
      {visualMode === 'schematic' ? (
        <TeachingSchematic />
      ) : hasWebGl ? (
        <Canvas
          camera={{ position: [13, 8, 14], fov: 40, near: 0.1, far: 80 }}
          dpr={quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : 1}
          gl={{ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' }}
          shadows={quality !== 'low'}
        >
          <DrivetrainScene />
        </Canvas>
      ) : null}
      {visualMode === 'cutaway' && (
        <>
          <div className="view-toolbar" role="group" aria-label="Camera preset views">
            <span><Crosshair size={14} /> View</span>
            {VIEWS.map((view) => <button key={view.id} className={cameraPreset === view.id ? 'active' : ''} aria-pressed={cameraPreset === view.id} onClick={() => { setCameraPreset(view.id); if (view.component) setSelectedComponent(view.component) }}>{view.label}</button>)}
          </div>
          <div className="viewport-hint"><Rotate3D size={15} /> Drag to orbit · scroll to zoom · right-drag to pan</div>
          <label className="quality-control"><Maximize2 size={14} /> <select value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </>
      )}
      <div className="energy-legend" aria-label="Energy flow colour legend">
        <span><i className="engine" /> Engine mechanical</span>
        <span><i className="battery" /> Battery use</span>
        <span><i className="regen" /> Regeneration</span>
        <span><i className="mg1" /> MG1 electrical</span>
        <span><i className="loss" /> Heat / braking loss</span>
      </div>
    </main>
  )
}
