# Toyota Hybrid Power Split Explorer

An interactive, browser-based 3D teaching model of the third-generation Toyota Hybrid Synergy Drive transaxle. The project focuses on the layout and operating ideas used around the Prius Gen 3 / Auris Hybrid 1.8-litre 2ZR-FXE system: a petrol engine, MG1, MG2, a planetary power-split device, fixed reduction gearing, differential, battery and inverter.

This is an educational model, not Toyota diagnostic software, a parts catalogue, or an engineering-certified drivetrain calculation tool.

## Run locally

Requires a current Node.js LTS release and a WebGL 2 capable browser.

```bash
npm install
npm run dev
```

Vite prints the local URL (normally `http://127.0.0.1:5173`).

Production build and preview:

```bash
npm run build
npm run preview
```

Run the simulation tests:

```bash
npm test
```

## Technology

- React and TypeScript
- Vite
- Three.js via React Three Fiber
- `@react-three/drei` for camera controls, labels and procedural scene helpers
- Zustand for simulation and UI state
- Vitest for the numerical/controller test suite
- Procedural geometry only; there are no paid assets, external APIs, or backend services

## What the model demonstrates

- MG1 is connected to the sun gear.
- The engine is connected to the planet carrier.
- The ring gear is connected to the wheel/output side.
- MG2 is permanently geared to the output side through a fixed reduction.
- MG1 controls the engine-to-wheel speed relationship; there is no belt, pulley, launch clutch, conventional reverse gear, or set of selectable ratios.
- Engine power may divide between a mechanical route to the output and an electrical route through MG1, the inverter and MG2.
- During regenerative braking, road energy travels backward through the wheels and differential to MG2, then electrically through the inverter to the battery.

The guided tour, component inspector, preset demonstrations, energy paths, exploded view and camera presets are intended to be used together. Actual RPM values can be too fast to see, so visual rotation is deliberately scaled while the dashboard retains the numerical RPM.

## Simulation assumptions

### Planetary relationship

The power-split calculation uses:

```text
Nr × ωr + Ns × ωs = (Nr + Ns) × ωc
```

where `r` is the ring/output member, `s` is the sun/MG1 member and `c` is the carrier/engine member. The model solves MG1 speed as the dependent variable:

```text
ωs = ((Nr + Ns) × ωc − Nr × ωr) / Ns
```

MG1 RPM is never clipped independently because that would violate the rigid gear equation. If a requested engine speed would overspeed MG1, the simulator constrains engine/carrier speed and marks MG1 as limit-protected in the telemetry.

Educational tooth counts:

- Ring: 78
- Sun: 30
- Displayed planet: 24

The procedural model draws fewer coarse teeth than the numerical count to remain legible and fast. The numerical relationship always uses the declared 78:30 counts.

### Fixed ratios and limits

- MG2 reduction: 2.636:1
- Final drive: 3.267:1
- Effective tyre radius: 0.30 m
- Engine: 0–5,200 rpm, up to approximately 73 kW
- MG1: ±10,000 rpm
- MG2: ±13,500 rpm, up to approximately 60 kW
- Vehicle speed: 0–180 km/h
- Regeneration: up to approximately 32 kW
- Combined wheel-side power: up to 100 kW before the simplified driveline losses
- Displayed battery SOC teaching window: 20–80%
- Simplified usable battery energy: 1.1 kWh

These values are plausible teaching assumptions, not a promise of exact behaviour for any one production model, software calibration, battery condition, tyre size, temperature, or market variant.

### Power and sign convention

Battery power is positive when the battery is discharging and negative when it is charging. MG2 power is positive while motoring and negative while generating. Regenerative power is displayed as a positive recovered magnitude. Wheel torque follows vehicle direction: negative values represent reverse drive or braking torque.

Wheel power and wheel torque are kept consistent through `P = Tω`. At low road speed, the requested torque limits power; at higher speed, the available engine/electrical power limits torque. Battery assist fades to zero at the protected lower SOC boundary.

Braking uses a simple blended-brake model. MG2 regeneration fades at walking speed, is capped by motor/battery acceptance, and the remaining requested wheel power is assigned to engine braking (when applicable) and hydraulic friction braking. Those contributions are shown separately in live telemetry.

### Automatic hybrid controller

Automatic mode chooses a clear teaching state from the selector position, road speed, accelerator, brake, battery SOC and engine temperature:

1. Neutral takes priority and removes commanded drive/regeneration.
2. Reverse commands negative MG2/wheel rotation without an engine-driven reverse gear.
3. At rest, the engine remains off when warm and SOC is sufficient; a cold engine warms up, and low SOC permits stationary charging.
4. Braking requests regeneration, then blends in hydraulic braking when speed, demand, or battery acceptance prevents full recovery.
5. Light, low-speed demand with useful SOC selects EV launch.
6. High demand selects combined engine/MG1/battery acceleration.
7. B mode adds engine braking while retaining available regeneration; moderate high-speed demand selects efficient cruise and other driving demand uses a blended engine/electric state.

The controller intentionally uses stable mode-sized approximations rather than recreating Toyota's proprietary hybrid control software, torque maps, voltage limits or thermal management.

## Presets and demonstrations

Preset definitions live in `src/simulation/scenarios.ts`. Add a preset by supplying:

- a unique `id`
- the menu `label` and compact `shortLabel`
- an educational operating `mode`
- the partial driver/system inputs that should be applied

The controller logic is in `src/simulation/controller.ts`. Keep energy paths consistent with component activity: a flow should only be added when its source, sink and intervening component are active.

Tutorial steps live in `src/data/tutorial.ts`. Each step selects a component and camera preset, and may optionally apply one of the scenario IDs.

## Project organisation

```text
src/
  data/          component explanations and tutorial content
  drivetrain/    procedural gears and mechanical/electrical assemblies
  scenes/        Three.js scene, camera, housing, flow and arrow systems
  simulation/    constants, types, planetary math, controller and tests
  state/         Zustand simulation/UI state
  ui/            controls, instruments, inspector and guided tour
```

## Known simplifications

- The layout is a cutaway technical exhibit, not a dimensionally exact production transaxle CAD model.
- Coarse procedural teeth preserve visible meshing direction but not production tooth profiles, helix angles, bearings or compound gear construction.
- Inertia, tyre slip, road grade, aerodynamics, traction/ABS blending, motor efficiency maps, voltage, current, battery temperature and engine transient dynamics are simplified.
- The speed slider sets the teaching state directly. The pedal values influence controller mode, power and torque rather than integrating a full vehicle longitudinal dynamics model.
- Battery SOC changes using approximate power integration while the simulation runs; production usable energy and SOC windows vary.
- Stationary charging represents the controlled equilibrium of the real system without modelling every balancing torque.
- B mode illustrates increased engine braking on long descents; it should not be interpreted as a stronger normal-regeneration setting.

## Educational disclaimer

Toyota, Prius, Auris and Hybrid Synergy Drive are trademarks of their respective owners. This independent simulator is for conceptual education only. Do not use its numbers to diagnose, repair, calibrate, certify, or make safety decisions about a vehicle.
