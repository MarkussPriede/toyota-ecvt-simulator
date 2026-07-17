# Toyota e-CVT Simulator

An interactive React/TypeScript teaching simulator for a Toyota Gen 3 P410-style hybrid powertrain. The default view is a beginner-readable 2D schematic; a procedural React Three Fiber cutaway provides a secondary mechanical view.

This is an independent educational approximation. It does not reproduce Toyota ECU calibration, diagnostic software, production CAD, or service data.

## Run locally

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
npm run build
npm run lint
```

## What is simulated

- Deterministic fixed-step longitudinal vehicle dynamics: traction, aerodynamic drag, rolling resistance, grade, regenerative braking, engine braking, and friction braking.
- Energy-based SOC integration with 40–80% protection, 45/60% charge-request hysteresis, charge/discharge power limits, losses, and accessories.
- Driving and stationary charge sustain through the engine, planetary set, MG1, inverter, and battery.
- Bounded `OFF → CRANKING → FUELED → STOPPING` engine transitions plus unfueled engine spinning for B mode and MG1 protection.
- Signed MG1/MG2 RPM and power ports, exact planetary kinematics, rigid MG2/final-drive ratios, and separate electrical/mechanical balance residuals.
- Deterministic scripted demonstrations and a pure scenario runner outside React and Three.js.

The simulator API lives in [`src/simulation/engine.ts`](src/simulation/engine.ts), with scenario execution in [`src/simulation/scenarios.ts`](src/simulation/scenarios.ts). React and Three.js display the resolved state; they do not calculate drivetrain physics.

## Visual teaching modes

### Teaching schematic — default

- Direct labels and leader paths for the engine, MG1, power-split members, MG2, fixed-carrier reduction planetary, final drive, differential, wheels, battery, and inverter.
- Live signed rotation, calculated energy paths, inactive-system dimming, selection/connection highlighting, park lock, charge-latch indicator, and a planetary speed nomograph.

### 3D cutaway — secondary

- P410-style power split and MG2 sun/fixed-carrier/ring reduction sets.
- Carrier/pin/planet animation hierarchies, readable differential internals, continuous shafts, staged exploded motion, exploded-aware connection paths, and instanced energy particles.
- Camera presets, component inspector, labels, rotation arrows, and quality modes remain available.

## Documentation

- [`docs/sign-conventions.md`](docs/sign-conventions.md) is authoritative for every power and rotation sign.
- [`docs/educational-model.md`](docs/educational-model.md) documents the vehicle, battery, engine, control, gear, efficiency, and geometry assumptions and their limitations.

## Project layout

```text
docs/          sign conventions and educational assumptions
src/data/      component explanations and guided tour
src/drivetrain procedural 3D assemblies and gears
src/scenes/    cutaway scene, camera, housing, energy paths
src/simulation pure deterministic engine, scenarios, tests
src/state/     Zustand runtime and lower-frequency UI telemetry
src/ui/        teaching schematic, controls, instruments, inspector
```

## Disclaimer

Toyota, Prius, Auris, and Hybrid Synergy Drive are trademarks of their respective owners. Do not use this simulator to diagnose, repair, calibrate, certify, or make safety decisions about a vehicle.
