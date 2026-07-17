import { useMemo } from 'react'
import { scenarioById } from '../simulation/scenarios'
import { useSimulator } from '../state/useSimulator'
import type { ComponentId, EnergyFlow, FlowId, FlowKind } from '../simulation/types'
import { fixedCarrierPlanetRpm, powerSplitPlanetRelativeRpm, reductionRingRpm } from '../drivetrain/visualMechanics'

const FLOW_COLORS: Record<FlowKind, string> = {
  engine: '#ff9a4d',
  battery: '#55aaff',
  regen: '#57e69c',
  mg1: '#b58cff',
  mg2: '#4de2ef',
  loss: '#ff6b70',
}

const FLOW_PATHS: Record<FlowId, string> = {
  'engine-planetary': 'M 158 264 L 278 264',
  'planetary-output': 'M 398 264 L 895 264',
  'output-wheels': 'M 895 264 L 1040 264 M 1040 264 L 1100 170 M 1040 264 L 1100 358',
  'battery-inverter': 'M 270 520 L 445 520',
  'inverter-mg2': 'M 520 520 C 570 480 585 390 600 333',
  'mg1-inverter': 'M 337 154 C 365 300 410 430 462 488',
  'inverter-mg1': 'M 462 488 C 410 430 365 300 337 154',
  'mg1-engine': 'M 337 154 C 285 170 230 212 158 264',
  'wheels-mg2': 'M 1100 170 L 1040 264 L 760 264 L 660 300',
  'inverter-battery': 'M 445 520 L 270 520',
  'drivetrain-engine': 'M 1040 264 L 398 264 L 158 264',
  'friction-brakes': 'M 1040 264 L 1100 170 M 1040 264 L 1100 358',
}

const MECHANICAL_LINKS: Partial<Record<ComponentId, ComponentId[]>> = {
  engine: ['carrier'],
  carrier: ['engine', 'planets', 'sun', 'ring'],
  planets: ['carrier', 'sun', 'ring'],
  sun: ['mg1', 'planets'],
  mg1: ['sun', 'inverter'],
  ring: ['planets', 'carrier', 'sun'],
  mg2: ['reduction', 'inverter'],
  reduction: ['mg2', 'ring', 'differential'],
  differential: ['reduction', 'wheels'],
  wheels: ['differential'],
  battery: ['inverter'],
  inverter: ['battery', 'mg1', 'mg2'],
}

function componentClass(id: ComponentId, selected: ComponentId, connected: Set<ComponentId>) {
  if (id === selected) return 'schematic-component is-selected'
  if (connected.has(id)) return 'schematic-component is-connected'
  return 'schematic-component is-dimmed'
}

function rotationStyle(rpm: number, running: boolean, visualSpeed: number, visualStep: number) {
  const seconds = Math.max(0.45, Math.min(8, 3_600 / Math.max(120, Math.abs(rpm)))) / visualSpeed
  return {
    animationDuration: `${seconds}s`,
    animationDirection: rpm < 0 ? 'reverse' : 'normal',
    animationPlayState: running && Math.abs(rpm) > 1 ? 'running' : 'paused',
    animationDelay: `${Math.abs(rpm) > 1 ? -visualStep * seconds / 36 : 0}s`,
  } as React.CSSProperties
}

function FlowOverlay({ flows, running, visualSpeed, visualStep }: { flows: EnergyFlow[]; running: boolean; visualSpeed: number; visualStep: number }) {
  const counts = new Map<FlowId, number>()
  return (
    <g className="schematic-flows" aria-label="Calculated signed energy paths">
      {flows.map((flow) => {
        const index = counts.get(flow.id) ?? 0
        counts.set(flow.id, index + 1)
        const offset = index === 0 ? 0 : index % 2 === 0 ? -4 * Math.ceil(index / 2) : 4 * Math.ceil(index / 2)
        return (
          <path
            key={`${flow.id}-${flow.kind}-${index}`}
            d={FLOW_PATHS[flow.id]}
            pathLength="100"
            className="schematic-flow"
            transform={`translate(0 ${offset})`}
            style={{
              stroke: FLOW_COLORS[flow.kind],
              strokeWidth: 3 + Math.min(5, flow.powerKw / 12),
              animationDirection: flow.direction < 0 ? 'reverse' : 'normal',
              animationPlayState: running ? 'running' : 'paused',
              animationDuration: `${1.1 / visualSpeed}s`,
              animationDelay: `${-visualStep * 0.08}s`,
            }}
          />
        )
      })}
    </g>
  )
}

function Nomograph() {
  const telemetry = useSimulator((state) => state.telemetry)
  const maximum = 10_000
  const y = (rpm: number) => 112 - Math.max(-maximum, Math.min(maximum, rpm)) / maximum * 88
  const sunX = 42
  const ringX = 310
  const carrierX = sunX + (ringX - sunX) * 78 / 108
  return (
    <svg className="nomograph" viewBox="0 0 352 138" role="img" aria-label="Live planetary speed nomograph">
      <text x="10" y="15" className="nomograph-title">PLANETARY SPEED LEVER</text>
      <line x1={sunX} y1="24" x2={sunX} y2="112" />
      <line x1={carrierX} y1="24" x2={carrierX} y2="112" />
      <line x1={ringX} y1="24" x2={ringX} y2="112" />
      <line className="nomograph-lever" x1={sunX} y1={y(telemetry.mg1Rpm)} x2={ringX} y2={y(telemetry.ringRpm)} />
      <circle className="nomograph-sun" cx={sunX} cy={y(telemetry.mg1Rpm)} r="5" />
      <circle className="nomograph-carrier" cx={carrierX} cy={y(telemetry.carrierRpm)} r="5" />
      <circle className="nomograph-ring" cx={ringX} cy={y(telemetry.ringRpm)} r="5" />
      <text x={sunX} y="128" textAnchor="middle">MG1 / sun</text>
      <text x={carrierX} y="128" textAnchor="middle">Engine / carrier</text>
      <text x={ringX} y="128" textAnchor="middle">Ring / output</text>
      <text x={sunX + 8} y={Math.max(30, y(telemetry.mg1Rpm) - 7)}>{Math.round(telemetry.mg1Rpm)} rpm</text>
      <text x={ringX - 8} y={Math.max(30, y(telemetry.ringRpm) - 7)} textAnchor="end">{Math.round(telemetry.ringRpm)} rpm</text>
    </svg>
  )
}

export function TeachingSchematic() {
  const telemetry = useSimulator((state) => state.telemetry)
  const selector = useSimulator((state) => state.inputs.selector)
  const selected = useSimulator((state) => state.selectedComponent)
  const setSelected = useSimulator((state) => state.setSelectedComponent)
  const running = useSimulator((state) => state.running)
  const visualSpeed = useSimulator((state) => state.visualSpeed)
  const visualStep = useSimulator((state) => state.visualStep)
  const energyArrows = useSimulator((state) => state.energyArrows)
  const activeScenarioId = useSimulator((state) => state.activeScenarioId)
  const scenarioElapsedSeconds = useSimulator((state) => state.scenarioElapsedSeconds)
  const connected = useMemo(() => new Set<ComponentId>([selected, ...(MECHANICAL_LINKS[selected] ?? [])]), [selected])
  const scenario = activeScenarioId ? scenarioById(activeScenarioId) : null
  const explanationIndex = scenario
    ? Math.min(scenario.explanationSteps.length - 1, Math.floor(scenarioElapsedSeconds / scenario.durationSeconds * scenario.explanationSteps.length))
    : 0
  const cls = (id: ComponentId) => componentClass(id, selected, connected)
  return (
    <div className="teaching-schematic">
      <div className="schematic-stage">
        <svg viewBox="0 0 1200 620" role="img" aria-label="Interactive Toyota P410-style hybrid teaching schematic">
          <defs>
            <filter id="soft-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <g className="schematic-background-links">
            <path className="shaft" d="M158 264 H278 M398 264 H895 M970 264 H1040 M1040 264 L1100 170 M1040 264 L1100 358" />
            <path className="electric-cable" d="M270 520 H445 M520 520 C570 480 585 390 600 333 M337 154 C365 300 410 430 462 488" />
          </g>

          <g className={cls('engine')} onClick={() => setSelected('engine')} role="button" tabIndex={0}>
            <rect x="48" y="215" width="110" height="98" rx="15" />
            <path d="M65 215 V190 H105 V215 M118 215 V190 H146 V215" />
            <circle className="schematic-rotor" style={rotationStyle(telemetry.engineRpm, running, visualSpeed, visualStep)} cx="135" cy="264" r="16" />
            <text x="103" y="337" textAnchor="middle">ENGINE</text>
            <text x="103" y="355" textAnchor="middle" className="sub-label">carrier input</text>
          </g>

          <g className={cls('ring')} onClick={() => setSelected('ring')}>
            <circle cx="338" cy="264" r="62" className="ring-gear schematic-rotor" style={rotationStyle(telemetry.ringRpm, running, visualSpeed, visualStep)} />
            <text x="338" y="349" textAnchor="middle">POWER-SPLIT DEVICE</text>
          </g>
          <g className={cls('sun')} onClick={() => setSelected('sun')}>
            <circle className="schematic-rotor sun-gear" style={rotationStyle(telemetry.mg1Rpm, running, visualSpeed, visualStep)} cx="338" cy="264" r="18" />
            <text x="338" y="270" textAnchor="middle" className="gear-letter">S</text>
          </g>
          <g className={cls('planets')} onClick={() => setSelected('planets')}>
            <g className="schematic-rotor planet-orbit" style={{ ...rotationStyle(telemetry.carrierRpm, running, visualSpeed, visualStep), transformOrigin: '338px 264px' }}>
              {[0, 120, 240].map((angle) => {
                const radians = angle * Math.PI / 180
                return <circle key={angle} cx={338 + Math.cos(radians) * 39} cy={264 + Math.sin(radians) * 39} r="13" className="planet-gear schematic-rotor" style={rotationStyle(powerSplitPlanetRelativeRpm(telemetry.mg1Rpm, telemetry.carrierRpm), running, visualSpeed, visualStep)} />
              })}
            </g>
          </g>
          <g className={cls('carrier')} onClick={() => setSelected('carrier')}>
            <circle className="carrier-line schematic-rotor" style={rotationStyle(telemetry.carrierRpm, running, visualSpeed, visualStep)} cx="338" cy="264" r="40" />
            <text x="338" y="192" textAnchor="middle" className="sub-label">engine → carrier</text>
          </g>

          <g className={cls('mg1')} onClick={() => setSelected('mg1')}>
            <rect x="286" y="74" width="104" height="80" rx="40" />
            <circle className="schematic-rotor mg1-rotor" style={rotationStyle(telemetry.mg1Rpm, running, visualSpeed, visualStep)} cx="338" cy="114" r="25" />
            <path className="shaft" d="M338 154 V202" />
            <text x="338" y="59" textAnchor="middle">MG1</text>
            <text x="338" y="173" textAnchor="middle" className="sub-label">sun connection</text>
          </g>

          <g className={cls('mg2')} onClick={() => setSelected('mg2')}>
            <rect x="560" y="214" width="105" height="100" rx="48" />
            <circle className="schematic-rotor mg2-rotor" style={rotationStyle(telemetry.mg2Rpm, running, visualSpeed, visualStep)} cx="612" cy="264" r="29" />
            <text x="612" y="199" textAnchor="middle">MG2</text>
            <text x="612" y="334" textAnchor="middle" className="sub-label">traction motor</text>
          </g>

          <g className={cls('reduction')} onClick={() => setSelected('reduction')}>
            <circle cx="752" cy="264" r="58" className="ring-gear reduction-ring schematic-rotor" style={rotationStyle(reductionRingRpm(telemetry.mg2Rpm), running, visualSpeed, visualStep)} />
            <circle className="schematic-rotor reduction-sun" style={rotationStyle(telemetry.mg2Rpm, running, visualSpeed, visualStep)} cx="752" cy="264" r="17" />
            {[0, 120, 240].map((angle) => {
              const radians = angle * Math.PI / 180
              return <circle key={angle} cx={752 + Math.cos(radians) * 37} cy={264 + Math.sin(radians) * 37} r="12" className="planet-gear schematic-rotor" style={rotationStyle(fixedCarrierPlanetRpm(telemetry.mg2Rpm), running, visualSpeed, visualStep)} />
            })}
            <path className="fixed-carrier" d="M752 223 V196 M739 196 H765 M744 190 H760 M749 184 H755" />
            <text x="752" y="349" textAnchor="middle">MG2 REDUCTION</text>
            <text x="752" y="368" textAnchor="middle" className="sub-label">sun 22 · fixed carrier · ring 58</text>
          </g>
          <text x="338" y="388" textAnchor="middle" className="schematic-speed-sign">C {telemetry.carrierRpm >= 0 ? '+' : '−'}{Math.abs(Math.round(telemetry.carrierRpm))} · S {telemetry.mg1Rpm >= 0 ? '+' : '−'}{Math.abs(Math.round(telemetry.mg1Rpm))} · R {telemetry.ringRpm >= 0 ? '+' : '−'}{Math.abs(Math.round(telemetry.ringRpm))} rpm</text>
          <text x="752" y="398" textAnchor="middle" className="schematic-speed-sign">SUN {telemetry.mg2Rpm >= 0 ? '+' : '−'}{Math.abs(Math.round(telemetry.mg2Rpm))} · RING {reductionRingRpm(telemetry.mg2Rpm) >= 0 ? '+' : '−'}{Math.abs(Math.round(reductionRingRpm(telemetry.mg2Rpm)))} rpm</text>

          <g className={cls('differential')} onClick={() => setSelected('differential')}>
            <circle cx="940" cy="264" r="43" />
            <circle cx="925" cy="264" r="13" className="side-gear" />
            <circle cx="955" cy="264" r="13" className="side-gear" />
            <circle cx="940" cy="247" r="9" className="spider-gear" />
            <circle cx="940" cy="281" r="9" className="spider-gear" />
            <text x="940" y="330" textAnchor="middle">FINAL DRIVE + DIFF</text>
          </g>
          <g className={cls('wheels')} onClick={() => setSelected('wheels')}>
            <rect x="1080" y="118" width="40" height="104" rx="18" />
            <rect x="1080" y="306" width="40" height="104" rx="18" />
            <path className="brake-caliper" d="M1078 154 h-12 v32 h12 M1078 342 h-12 v32 h12" />
            <text x="1140" y="269" textAnchor="middle">WHEELS</text>
          </g>

          <g className={cls('battery')} onClick={() => setSelected('battery')}>
            <rect x="95" y="474" width="175" height="92" rx="14" />
            {[0, 1, 2, 3, 4, 5].map((cell) => <rect key={cell} x={113 + cell * 24} y="493" width="16" height="50" rx="3" className="battery-cell" />)}
            <text x="182" y="591" textAnchor="middle">HV BATTERY · {telemetry.batterySoc.toFixed(1)}%</text>
          </g>
          <g className={cls('inverter')} onClick={() => setSelected('inverter')}>
            <rect x="445" y="476" width="78" height="88" rx="12" />
            <path d="M464 497 h40 M464 510 h40 M464 523 h40 M464 536 h40" />
            <text x="484" y="591" textAnchor="middle">INVERTER</text>
          </g>

          {telemetry.chargeRequestActive && <g className="charge-latch"><rect x="610" y="487" width="180" height="42" rx="21" /><text x="700" y="513" textAnchor="middle">CHARGE REQUEST LATCHED</text></g>}
          {selector === 'P' && <g className="parking-pawl"><path d="M882 221 l17 23 15-31" /><text x="900" y="198" textAnchor="middle">PARK PAWL</text></g>}
          {energyArrows && <FlowOverlay flows={telemetry.energyFlows} running={running} visualSpeed={visualSpeed} visualStep={visualStep} />}
        </svg>
      </div>
      <div className="schematic-learning-rail">
        <div className="mode-teaching-copy"><span>{scenario ? `DEMONSTRATION · ${scenario.label}` : telemetry.motionLabel}</span><strong>{telemetry.objectiveLabel}</strong><p>{scenario ? scenario.explanationSteps[explanationIndex] : telemetry.description}</p></div>
        <Nomograph />
      </div>
    </div>
  )
}
