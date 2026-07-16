import { BatteryCharging, Gauge, MoveRight, Zap } from 'lucide-react'
import { useSimulator } from '../state/useSimulator'

function Instrument({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return <div className={`instrument ${tone ?? ''}`}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>
}

export function InstrumentPanel() {
  const inputs = useSimulator((state) => state.inputs)
  const o = useSimulator((state) => state.output)
  const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  return (
    <footer className="instrument-panel">
      <div className="cluster-title"><Gauge size={18} /><div><span>LIVE TELEMETRY</span><strong>Visual speed scaled</strong></div></div>
      <div className="instrument-grid">
        <Instrument label="Vehicle" value={fmt(inputs.vehicleSpeed)} unit="km/h" />
        <Instrument label="Engine" value={fmt(o.engineRpm)} unit="rpm" tone="engine-tone" />
        <Instrument label={o.mg1LimitActive ? 'MG1 · limit protected' : 'MG1'} value={fmt(o.mg1Rpm)} unit="rpm" tone={o.mg1LimitActive ? 'limit-tone' : 'mg1-tone'} />
        <Instrument label="MG2" value={fmt(o.mg2Rpm)} unit="rpm" tone="mg2-tone" />
        <Instrument label="Battery SOC" value={fmt(inputs.batterySoc, 1)} unit="%" />
        <Instrument label="Battery" value={fmt(o.batteryPowerKw, 1)} unit="kW" tone={o.batteryPowerKw < 0 ? 'regen-tone' : 'battery-tone'} />
        <Instrument label="Engine power" value={fmt(o.enginePowerKw, 1)} unit="kW" tone="engine-tone" />
        <Instrument label="MG2 power" value={fmt(o.mg2PowerKw, 1)} unit="kW" tone="mg2-tone" />
        <Instrument label="Wheel power" value={fmt(o.wheelPowerKw, 1)} unit="kW" />
        <Instrument label="Wheel torque" value={fmt(o.wheelTorqueNm)} unit="Nm" />
        <Instrument label="Regeneration" value={fmt(o.regenPowerKw, 1)} unit="kW" tone="regen-tone" />
        <Instrument label="Hydraulic brakes" value={fmt(o.frictionBrakePowerKw, 1)} unit="kW" tone={o.frictionBrakePowerKw > 0.1 ? 'friction-tone' : undefined} />
      </div>
      <div className="flow-summary"><BatteryCharging size={17} /><div><span>ENERGY FLOW</span><strong>{o.description}</strong></div><MoveRight size={16} /></div>
      <div className="sign-legend"><Zap size={13} /> Battery + discharge / − charge</div>
    </footer>
  )
}
