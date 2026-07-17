import { ControlsPanel } from './ui/ControlsPanel'
import { InfoPanel } from './ui/InfoPanel'
import { InstrumentPanel } from './ui/InstrumentPanel'
import { SceneViewport } from './ui/SceneViewport'
import { SimulationRuntime } from './ui/SimulationRuntime'
import { TopBar } from './ui/TopBar'
import { TutorialOverlay } from './ui/TutorialOverlay'

export function App() {
  return (
    <div className="app-shell">
      <SimulationRuntime />
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
