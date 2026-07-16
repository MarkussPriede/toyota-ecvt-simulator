import { ChevronDown, Eye, EyeOff, Pause, Play, RotateCcw, Thermometer, Timer, Zap } from 'lucide-react'
import { useState } from 'react'
import { useSimulator } from '../state/useSimulator'
import type { DriveSelector } from '../simulation/types'

function RangeControl({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (value: number) => void }) {
  const percentage = ((value - min) / (max - min)) * 100
  return (
    <label className="range-control">
      <span><b>{label}</b><output>{value.toFixed(step < 1 ? 2 : 0)} <em>{unit}</em></output></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--range': `${percentage}%` } as React.CSSProperties} />
    </label>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

export function ControlsPanel() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const state = useSimulator()
  const { inputs } = state
  const selectors: DriveSelector[] = ['P', 'R', 'N', 'D', 'B']
  const selectorDisabled = (selector: DriveSelector) => {
    const reversingDirection = (inputs.selector === 'R' && (selector === 'D' || selector === 'B'))
      || (selector === 'R' && (inputs.selector === 'D' || inputs.selector === 'B'))
    return (selector === 'P' && inputs.vehicleSpeed > 1) || (reversingDirection && inputs.vehicleSpeed > 5)
  }
  return (
    <aside className={`side-panel controls-panel ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Simulation controls">
      <button className="mobile-drawer-toggle" type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
        <span><b>Simulation controls</b><small>Driver inputs, playback & view</small></span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <div className="panel-heading">
        <div><p className="eyebrow">DRIVER INPUTS</p><h2>Simulation controls</h2></div>
        <span className={`live-pill ${state.running ? '' : 'paused'}`}>{state.running ? 'LIVE' : 'PAUSED'}</span>
      </div>

      <section className="control-section">
        <RangeControl label="Accelerator" value={inputs.accelerator} min={0} max={100} unit="%" onChange={(value) => state.setInput('accelerator', value)} />
        <RangeControl label="Brake pedal" value={inputs.brake} min={0} max={100} unit="%" onChange={(value) => state.setInput('brake', value)} />
        <RangeControl label="Vehicle speed" value={inputs.vehicleSpeed} min={0} max={180} unit="km/h" onChange={(value) => state.setInput('vehicleSpeed', value)} />
        <RangeControl label="Battery SOC" value={inputs.batterySoc} min={20} max={80} unit="%" onChange={(value) => state.setInput('batterySoc', value)} />
      </section>

      <section className="control-section">
        <div className="section-label"><span>Drive selector</span><small>No physical disconnect in N</small></div>
        <div className="selector-row">
          {selectors.map((selector) => {
            const disabled = selectorDisabled(selector)
            return <button key={selector} className={inputs.selector === selector ? 'active' : ''} disabled={disabled} aria-pressed={inputs.selector === selector} title={disabled ? 'Slow to walking speed before selecting this position' : undefined} onClick={() => state.setSelector(selector)}>{selector}</button>
          })}
        </div>
      </section>

      <section className="control-section switches">
        <Switch checked={inputs.automatic} onChange={(value) => state.setInput('automatic', value)} label="Automatic mode selection" />
        <Switch checked={inputs.engineWarm} onChange={(value) => state.setInput('engineWarm', value)} label="Engine warmed up" />
      </section>

      <section className="control-section">
        <div className="section-label"><span>Playback</span><Timer size={14} /></div>
        <div className="transport-row">
          <button className="icon-button" onClick={() => state.setRunning(!state.running)} aria-label={state.running ? 'Pause' : 'Start'}>{state.running ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="icon-button" onClick={state.reset} aria-label="Reset simulation"><RotateCcw size={16} /></button>
          {[0.25, 0.5, 1, 2].map((speed) => <button key={speed} className={`speed-button ${state.timeScale === speed ? 'active' : ''}`} aria-pressed={state.timeScale === speed} onClick={() => state.setTimeScale(speed)}>{speed}×</button>)}
        </div>
        <p className="micro-note"><Zap size={13} /> Visual rotation speed is scaled; RPM readouts are numerical.</p>
      </section>

      <section className="control-section view-controls">
        <RangeControl label="Housing" value={state.housingOpacity} min={0} max={0.72} step={0.01} unit="opacity" onChange={state.setHousingOpacity} />
        <RangeControl label="Exploded view" value={state.exploded} min={0} max={1} step={0.01} unit="" onChange={state.setExploded} />
        <div className="toggle-grid">
          <button className={state.labels ? 'active' : ''} aria-pressed={state.labels} onClick={() => state.setLabels(!state.labels)}>{state.labels ? <Eye size={14} /> : <EyeOff size={14} />} Labels</button>
          <button className={state.energyArrows ? 'active' : ''} aria-pressed={state.energyArrows} onClick={() => state.setEnergyArrows(!state.energyArrows)}><Zap size={14} /> Energy</button>
          <button className={state.rotationArrows ? 'active' : ''} aria-pressed={state.rotationArrows} onClick={() => state.setRotationArrows(!state.rotationArrows)}><RotateCcw size={14} /> Rotation</button>
          <button className={!inputs.engineWarm ? 'active warm' : ''} aria-pressed={!inputs.engineWarm} onClick={() => state.setInput('engineWarm', !inputs.engineWarm)}><Thermometer size={14} /> Cold engine</button>
        </div>
      </section>
    </aside>
  )
}
