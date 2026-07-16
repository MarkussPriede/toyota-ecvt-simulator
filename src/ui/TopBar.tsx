import { BookOpen, ChevronDown, Gauge, Pause, Play } from 'lucide-react'
import { SCENARIOS } from '../simulation/scenarios'
import { useSimulator } from '../state/useSimulator'

export function TopBar() {
  const applyScenario = useSimulator((state) => state.applyScenario)
  const activeScenarioId = useSimulator((state) => state.activeScenarioId)
  const output = useSimulator((state) => state.output)
  const running = useSimulator((state) => state.running)
  const setTutorial = useSimulator((state) => state.setTutorial)
  const setRunning = useSimulator((state) => state.setRunning)
  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <div className="brand-mark"><Gauge size={21} /></div>
        <div>
          <p className="eyebrow">HYBRID SYSTEMS LAB</p>
          <h1>Power Split <span>Explorer</span></h1>
        </div>
      </div>
      <div className="mode-readout" aria-live="polite">
        <span className="status-dot" />
        <div><small>OPERATING MODE</small><strong>{output.modeLabel}</strong></div>
      </div>
      <div className="top-actions">
        <label className="scenario-select">
          <span>Preset demonstration</span>
          <div>
            <select value={activeScenarioId ?? ''} onChange={(event) => { if (event.target.value) applyScenario(event.target.value) }}>
              <option value="" disabled>Choose a scenario…</option>
              {SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </label>
        <button className="button secondary" onClick={() => { setTutorial(true, 0); setRunning(true) }}><BookOpen size={16} /> Guided tour</button>
        <button className="button primary compact" onClick={() => setRunning(!running)} aria-label={running ? 'Pause simulation' : 'Run simulation'} aria-pressed={!running}>
          {running ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>
    </header>
  )
}
