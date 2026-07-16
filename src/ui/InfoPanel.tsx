import { Activity, Cable, ChevronDown, ChevronRight, Cog, Info } from 'lucide-react'
import { useState } from 'react'
import { COMPONENTS, CONCEPTS } from '../data/components'
import { useSimulator } from '../state/useSimulator'

export function InfoPanel() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const selected = useSimulator((state) => state.selectedComponent)
  const output = useSimulator((state) => state.output)
  const component = COMPONENTS[selected]
  const currentNote = component.modeNotes[output.mode]
  const live = selected === 'engine'
    ? `${Math.round(output.engineRpm).toLocaleString()} rpm · ${output.enginePowerKw.toFixed(1)} kW`
    : selected === 'mg1' || selected === 'sun'
      ? `${Math.round(output.mg1Rpm).toLocaleString()} rpm · ${output.mg1PowerKw.toFixed(1)} kW`
      : selected === 'mg2'
        ? `${Math.round(output.mg2Rpm).toLocaleString()} rpm · ${output.mg2PowerKw.toFixed(1)} kW`
        : selected === 'ring'
          ? `${Math.round(output.ringRpm).toLocaleString()} rpm`
          : selected === 'wheels' || selected === 'differential'
            ? `${Math.round(output.wheelRpm).toLocaleString()} rpm · ${Math.round(output.wheelTorqueNm)} Nm`
            : selected === 'battery'
              ? `${useSimulator.getState().inputs.batterySoc.toFixed(1)}% · ${output.batteryPowerKw.toFixed(1)} kW`
              : 'Live state follows the highlighted path'
  return (
    <aside className={`side-panel info-panel ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label="Component information">
      <button className="mobile-drawer-toggle" type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
        <span><b>{component.name}</b><small>Component inspector</small></span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <div className="panel-heading">
        <div><p className="eyebrow">COMPONENT INSPECTOR</p><h2>{component.name}</h2></div>
        <span className="component-icon"><Cog size={19} /></span>
      </div>
      <div className="component-tag">{component.tag}</div>
      <div className="live-component"><Activity size={15} /><span>LIVE</span><strong>{live}</strong></div>

      <section className="info-block">
        <h3><Info size={14} /> What it does</h3>
        <p>{component.purpose}</p>
      </section>
      <section className="info-block">
        <h3><Cable size={14} /> Connected to</h3>
        <p>{component.connection}</p>
      </section>
      {currentNote && <div className="mode-note"><b>In {output.modeLabel}</b><span>{currentNote}</span></div>}

      <details className="technical-detail">
        <summary>Beginner explanation <ChevronRight size={14} /></summary>
        <p>{component.beginner}</p>
      </details>
      <details className="technical-detail">
        <summary>Technical note <ChevronRight size={14} /></summary>
        <p>{component.technical}</p>
      </details>

      <div className="concepts-heading"><span>Essential eCVT concepts</span></div>
      <div className="concept-list">
        {CONCEPTS.map(([title, text]) => (
          <details key={title}>
            <summary>{title}<ChevronRight size={14} /></summary>
            <p>{text}</p>
          </details>
        ))}
      </div>
    </aside>
  )
}
