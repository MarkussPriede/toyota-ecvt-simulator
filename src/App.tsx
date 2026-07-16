import { AlertTriangle } from 'lucide-react'
import { ControlsPanel } from './ui/ControlsPanel'
import { InfoPanel } from './ui/InfoPanel'
import { InstrumentPanel } from './ui/InstrumentPanel'
import { SceneViewport } from './ui/SceneViewport'
import { TopBar } from './ui/TopBar'
import { TutorialOverlay } from './ui/TutorialOverlay'

function webGlAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

export function App() {
  if (!webGlAvailable()) {
    return <div className="webgl-error"><AlertTriangle size={32} /><h1>WebGL 2 is unavailable</h1><p>This 3D simulator needs a browser with WebGL 2 and hardware acceleration enabled. Try updating the browser or enabling graphics acceleration.</p></div>
  }
  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace">
        <ControlsPanel />
        <SceneViewport />
        <InfoPanel />
      </div>
      <InstrumentPanel />
      <TutorialOverlay />
    </div>
  )
}
