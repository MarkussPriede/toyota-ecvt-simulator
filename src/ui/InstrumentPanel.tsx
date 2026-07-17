import { BatteryCharging, Gauge, MoveRight, ShieldCheck, Zap } from 'lucide-react'
import { useSimulator } from '../state/useSimulator'

function Instrument({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return <div className={`instrument ${tone ?? ''}`}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>
}

export function InstrumentPanel() {
  const telemetry = useSimulator((state) => state.telemetry)
  const developerMode = useSimulator((state) => state.developerMode)
  const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  return (
    <footer className={`instrument-panel ${developerMode ? 'developer-open' : ''}`}>
      <div className="cluster-title"><Gauge size={18} /><div><span>LIVE TELEMETRY</span><strong>Physics at fixed 120 Hz</strong></div></div>
      <div className="instrument-grid">
        <Instrument label="Vehicle" value={fmt(telemetry.vehicleSpeedKph, 1)} unit="km/h" />
        <Instrument label="Acceleration" value={fmt(telemetry.vehicleAccelerationMps2, 2)} unit="m/s²" />
        <Instrument label="Motion state" value={telemetry.motionLabel} unit="" />
        <Instrument label="System objective" value={telemetry.objectiveLabel} unit="" />
        <Instrument label={`Engine · ${telemetry.engineState}`} value={fmt(telemetry.engineRpm)} unit="rpm" tone="engine-tone" />
        <Instrument label="Engine torque" value={fmt(telemetry.engineTorqueNm)} unit="Nm" tone="engine-tone" />
        <Instrument label="Engine power" value={fmt(telemetry.engineMechanicalPowerKw, 1)} unit="kW" tone="engine-tone" />
        <Instrument label={telemetry.mg1LimitActive ? 'MG1 · protected' : 'MG1 signed'} value={fmt(telemetry.mg1Rpm)} unit="rpm" tone={telemetry.mg1LimitActive ? 'limit-tone' : 'mg1-tone'} />
        <Instrument label="MG1 mechanical" value={fmt(telemetry.mg1MechanicalPowerKw, 1)} unit="kW" tone="mg1-tone" />
        <Instrument label="MG1 electrical" value={fmt(telemetry.mg1ElectricalPowerKw, 1)} unit="kW" tone="mg1-tone" />
        <Instrument label="MG2 signed" value={fmt(telemetry.mg2Rpm)} unit="rpm" tone="mg2-tone" />
        <Instrument label="MG2 mechanical" value={fmt(telemetry.mg2MechanicalPowerKw, 1)} unit="kW" tone="mg2-tone" />
        <Instrument label="MG2 electrical" value={fmt(telemetry.mg2ElectricalPowerKw, 1)} unit="kW" tone="mg2-tone" />
        <Instrument label="Battery SOC" value={fmt(telemetry.batterySoc, 1)} unit="%" />
        <Instrument label="Battery + discharge" value={fmt(telemetry.batteryTerminalPowerKw, 1)} unit="kW" tone={telemetry.batteryTerminalPowerKw < 0 ? 'regen-tone' : 'battery-tone'} />
        <Instrument label="Charge request" value={telemetry.chargeRequestActive ? 'LATCHED' : 'clear'} unit="" tone={telemetry.chargeRequestActive ? 'regen-tone' : undefined} />
        <Instrument label="Protected reserve" value={fmt(telemetry.protectedReserveEnergyKwh * 1_000, 1)} unit="Wh" tone={telemetry.protectedReservePowerKw > 0 ? 'limit-tone' : undefined} />
        <Instrument label="SOC preferred" value={fmt(telemetry.socTargetPercent)} unit="%" />
        <Instrument label="Wheel torque" value={fmt(telemetry.wheelTorqueNm)} unit="Nm" />
        <Instrument label="Wheel power" value={fmt(telemetry.wheelPowerKw, 1)} unit="kW" />
        <Instrument label="Regeneration" value={fmt(telemetry.regenerativeBrakingKw, 1)} unit="kW" tone="regen-tone" />
        <Instrument label="Friction braking" value={fmt(telemetry.frictionBrakeLossKw, 1)} unit="kW" tone={telemetry.frictionBrakeLossKw > 0.1 ? 'friction-tone' : undefined} />
        <Instrument label="Engine braking" value={fmt(telemetry.enginePumpingLossKw, 1)} unit="kW" />
        <Instrument label="Road load" value={fmt(telemetry.roadLoadPowerKw, 1)} unit="kW" />
      </div>
      <div className="flow-summary"><BatteryCharging size={17} /><div><span>ENERGY FLOW</span><strong>{telemetry.description}</strong></div><MoveRight size={16} /></div>
      <div className="sign-legend"><Zap size={13} /> Battery + = discharge · Battery − = charge · machine mechanical + = delivery</div>
      {developerMode && <div className="developer-diagnostics">
        <span><ShieldCheck size={13} /> POWER BALANCE</span>
        <b>Residual {telemetry.powerBalanceResidualKw.toExponential(2)} kW</b>
        <em>DC {telemetry.electricalBalanceResidualKw.toExponential(2)}</em>
        <em>Mechanical {telemetry.mechanicalBalanceResidualKw.toExponential(2)}</em>
        <em>Motor loss {telemetry.motorLossKw.toFixed(2)} kW</em>
        <em>Inverter {telemetry.inverterLossKw.toFixed(2)} kW</em>
        <em>Throughput {telemetry.inverterThroughputKw.toFixed(1)} kW</em>
        <em>Reserve {telemetry.protectedReservePowerKw.toFixed(2)} kW</em>
        <em>Driveline {telemetry.drivetrainLossKw.toFixed(2)} kW</em>
        <em>Planet residual {telemetry.planetaryResidualRpmTeeth.toExponential(1)}</em>
        <em>MG2 ratio residual {telemetry.mg2RatioResidualRpm.toExponential(1)} rpm</em>
        <em>Demand gap {telemetry.wheelDemandShortfallKw.toFixed(2)} kW</em>
        <em>Max violation {Math.max(
          telemetry.engineTorqueViolationNm,
          telemetry.enginePowerViolationKw,
          telemetry.mg1TorqueViolationNm,
          telemetry.mg1PowerViolationKw,
          telemetry.mg2TorqueViolationNm,
          telemetry.mg2PowerViolationKw,
          telemetry.batteryDischargeViolationKw,
          telemetry.batteryChargeViolationKw,
          telemetry.inverterThroughputViolationKw,
        ).toExponential(1)}</em>
      </div>}
    </footer>
  )
}
