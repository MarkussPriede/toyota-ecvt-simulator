import { ChevronDown, Eye, EyeOff, FlaskConical, Gauge, Pause, Play, RotateCcw, StepForward, Thermometer, Timer, Zap } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BATTERY, maxVehicleSpeedMps } from '../simulation/constants'
import type { DriveSelector } from '../simulation/types'
import { useSimulator } from '../state/useSimulator'

function RangeControl({ label, value, min, max, step = 1, unit, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; disabled?: boolean; onChange: (value: number) => void }) {
  const percentage = ((value - min) / (max - min)) * 100
  return (
    <label className={`range-control ${disabled ? 'is-disabled' : ''}`}>
      <span><b>{label}</b><output>{value.toFixed(step < 1 ? 1 : 0)} <em>{unit}</em></output></span>
      <input disabled={disabled} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--range': `${percentage}%` } as React.CSSProperties} />
    </label>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="switch-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>
}

export function ControlsPanel() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const values = useSimulator(useShallow((state) => ({
    accelerator: state.inputs.accelerator,
    brake: state.inputs.brake,
    selector: state.inputs.selector,
    roadGradePercent: state.inputs.roadGradePercent,
    speedKph: state.telemetry.vehicleSpeedKph,
    batterySoc: state.simulation.batterySoc,
    engineTemperatureC: state.simulation.engineTemperatureC,
    running: state.running,
    timeScale: state.timeScale,
    visualSpeed: state.visualSpeed,
    visualMode: state.visualMode,
    developerMode: state.developerMode,
    inspectionMode: state.inspectionMode,
    housingOpacity: state.housingOpacity,
    exploded: state.exploded,
    labels: state.labels,
    energyArrows: state.energyArrows,
    rotationArrows: state.rotationArrows,
  })))
  const actions = useSimulator(useShallow((state) => ({
    setInput: state.setInput, setBatterySoc: state.setBatterySoc, setEngineTemperature: state.setEngineTemperature,
    setInspectionSpeedKph: state.setInspectionSpeedKph, setSelector: state.setSelector, setRunning: state.setRunning,
    setTimeScale: state.setTimeScale, setDeveloperMode: state.setDeveloperMode, setInspectionMode: state.setInspectionMode,
    setVisualSpeed: state.setVisualSpeed, stepMechanism: state.stepMechanism,
    setHousingOpacity: state.setHousingOpacity, setExploded: state.setExploded, setLabels: state.setLabels,
    setEnergyArrows: state.setEnergyArrows, setRotationArrows: state.setRotationArrows, reset: state.reset,
  })))
  const selectors: DriveSelector[] = ['P', 'R', 'N', 'D', 'B']
  const selectorDisabled = (selector: DriveSelector) => {
    const reversing = (values.selector === 'R' && (selector === 'D' || selector === 'B'))
      || (selector === 'R' && (values.selector === 'D' || values.selector === 'B'))
    return (selector === 'P' && Math.abs(values.speedKph) > 1) || (reversing && Math.abs(values.speedKph) > 5)
  }
  return (
    <aside className={`side-panel controls-panel ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Simulation controls">
      <button className="mobile-drawer-toggle" type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
        <span><b>Simulation controls</b><small>Driver inputs, playback & view</small></span><ChevronDown size={17} aria-hidden="true" />
      </button>
      <div className="panel-heading">
        <div><p className="eyebrow">DRIVER INPUTS</p><h2>Simulation controls</h2></div>
        <span className={`live-pill ${values.running ? '' : 'paused'}`}>{values.running ? 'LIVE' : 'PAUSED'}</span>
      </div>

      <section className="control-section">
        <div className="live-speed-card"><Gauge size={15} /><span>Calculated vehicle speed</span><strong>{values.speedKph.toFixed(1)} <small>km/h</small></strong></div>
        <RangeControl label="Accelerator" value={values.accelerator * 100} min={0} max={100} unit="%" onChange={(value) => actions.setInput('accelerator', value / 100)} />
        <RangeControl label="Brake pedal" value={values.brake * 100} min={0} max={100} unit="%" onChange={(value) => actions.setInput('brake', value / 100)} />
        <RangeControl label="Road grade" value={values.roadGradePercent} min={-12} max={12} step={0.5} unit="%" onChange={(value) => actions.setInput('roadGradePercent', value)} />
      </section>

      <section className="control-section">
        <div className="section-label"><span>Drive selector</span><small>P blocked while moving</small></div>
        <div className="selector-row">{selectors.map((selector) => {
          const disabled = selectorDisabled(selector)
          return <button key={selector} className={values.selector === selector ? 'active' : ''} disabled={disabled} aria-pressed={values.selector === selector} title={disabled ? 'Slow to walking speed before selecting this position' : undefined} onClick={() => actions.setSelector(selector)}>{selector}</button>
        })}</div>
      </section>

      <section className="control-section">
        <div className="section-label"><span>Teaching setup</span><FlaskConical size={14} /></div>
        <RangeControl label="Battery SOC override" value={values.batterySoc} min={BATTERY.hardLowerSoc} max={BATTERY.hardUpperSoc} step={0.5} unit="%" onChange={actions.setBatterySoc} />
        <RangeControl label="Engine temperature" value={values.engineTemperatureC} min={20} max={100} unit="°C" onChange={actions.setEngineTemperature} />
        <Switch checked={values.inspectionMode} onChange={actions.setInspectionMode} label="Static speed inspection" />
        {values.inspectionMode && <RangeControl label="Inspection speed" value={Math.abs(values.speedKph)} min={0} max={maxVehicleSpeedMps * 3.6} unit="km/h" disabled={values.running} onChange={actions.setInspectionSpeedKph} />}
        <p className="micro-note"><FlaskConical size={13} /> Setup overrides are educational tools; speed is force-integrated in normal simulation.</p>
      </section>

      <section className="control-section">
        <div className="section-label"><span>Playback</span><Timer size={14} /></div>
        <div className="transport-row">
          <button className="icon-button" onClick={() => actions.setRunning(!values.running)} aria-label={values.running ? 'Pause' : 'Start'}>{values.running ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="icon-button" onClick={actions.reset} aria-label="Reset simulation"><RotateCcw size={16} /></button>
          {[0.25, 0.5, 1, 2].map((speed) => <button key={speed} className={`speed-button ${values.timeScale === speed ? 'active' : ''}`} aria-pressed={values.timeScale === speed} onClick={() => actions.setTimeScale(speed)}>{speed}×</button>)}
        </div>
        <div className="section-label mechanism-speed-label"><span>Mechanism visual speed</span><small>physics unchanged</small></div>
        <div className="transport-row">
          {[0.1, 0.25, 0.5, 1].map((speed) => <button key={speed} className={`speed-button ${values.visualSpeed === speed ? 'active' : ''}`} aria-pressed={values.visualSpeed === speed} onClick={() => actions.setVisualSpeed(speed)}>{speed}×</button>)}
          <button className="icon-button" onClick={actions.stepMechanism} aria-label="Step mechanism movement" title="Advance visible movement without advancing physics"><StepForward size={16} /></button>
        </div>
        <p className="micro-note"><Zap size={13} /> Physics speed and visual slow-motion are independent. Step advances only the mechanism view.</p>
      </section>

      <section className="control-section switches">
        <Switch checked={values.developerMode} onChange={actions.setDeveloperMode} label="Developer diagnostics" />
      </section>

      <section className="control-section view-controls">
        {values.visualMode === 'cutaway' && <>
          <RangeControl label="Housing" value={values.housingOpacity} min={0} max={0.72} step={0.01} unit="opacity" onChange={actions.setHousingOpacity} />
          <RangeControl label="Staged exploded view" value={values.exploded} min={0} max={1} step={0.01} unit="" onChange={actions.setExploded} />
        </>}
        <div className="toggle-grid">
          <button className={values.labels ? 'active' : ''} aria-pressed={values.labels} onClick={() => actions.setLabels(!values.labels)}>{values.labels ? <Eye size={14} /> : <EyeOff size={14} />} Labels</button>
          <button className={values.energyArrows ? 'active' : ''} aria-pressed={values.energyArrows} onClick={() => actions.setEnergyArrows(!values.energyArrows)}><Zap size={14} /> Energy</button>
          <button className={values.rotationArrows ? 'active' : ''} aria-pressed={values.rotationArrows} onClick={() => actions.setRotationArrows(!values.rotationArrows)}><RotateCcw size={14} /> Rotation</button>
          <button className={values.engineTemperatureC < 50 ? 'active warm' : ''} onClick={() => actions.setEngineTemperature(values.engineTemperatureC < 50 ? 82 : 25)}><Thermometer size={14} /> Cold start</button>
        </div>
      </section>
    </aside>
  )
}
