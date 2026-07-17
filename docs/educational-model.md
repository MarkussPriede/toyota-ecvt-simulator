# Educational simulation model

This project is a deterministic teaching simulator, not a reproduction of Toyota ECU software, calibration maps, diagnostic logic, or production CAD. Control thresholds, efficiencies, thermal rates, torque requests, and component geometry not published by Toyota are explicitly educational approximations.

## Public architecture basis

Toyota describes the hybrid power-split device as a planetary gear that divides engine power between direct wheel drive and generator power, with regenerative braking returning road energy through the traction motor. Toyota also describes the third-generation Prius as using the 2ZR-FXE engine, a compact high-speed 60 kW / 207 Nm motor, and a motor reduction gear. Primary references:

- [Toyota: third-generation Prius launch and system specifications](https://global.toyota/en/newsroom/toyota/22684821.html)
- [Toyota: conceptual Hybrid System power paths and charge sustain](https://global.toyota/en/detail/7889139)
- [Toyota Technical Review Vol. 57 No. 1: Hybrid Technologies in the Third Generation Prius](https://global.toyota/pages/global_toyota/mobility/technology/toyota-technical-review/TTR_Vol57-1_E.pdf)

The visual model is therefore described as **P410-style**. It illustrates the published concept but is not dimensional production geometry.

## Longitudinal vehicle assumptions

| Quantity | Value | Use |
|---|---:|---|
| Vehicle mass | 1,475 kg | `F = ma` |
| Effective tyre radius | 0.30 m | wheel torque and RPM |
| Drag coefficient | 0.25 | aerodynamic drag; matches Toyota's published third-generation value |
| Frontal area | 2.20 m² | educational approximation |
| Air density | 1.225 kg/m³ | sea-level teaching constant |
| Rolling resistance coefficient | 0.0105 | educational touring-tyre approximation |
| Maximum tyre force | 6,200 N | combined traction cap |
| Maximum requested brake force | 10,500 N | brake-pedal mapping |

Each fixed 1/120-second internal substep calculates:

```text
drive force
- aerodynamic drag
- rolling resistance
- road-grade force
- regenerative brake force
- engine-brake force
- friction-brake force
= net force

acceleration = net force / mass
speed += acceleration × dt
position += average speed × dt
```

The accelerator requests force and power, not road speed. Torque and copper loss are represented at zero wheel speed, so EV launch does not collapse to zero merely because `power = torque × speed` is initially zero.

## Battery model

The pack is represented as a 1.31 kWh nominal energy buffer with terminal-power limits applied before energy integration.

| Threshold | SOC |
|---|---:|
| Hard lower boundary | 40% |
| Charge request sets | 45% |
| Preferred target | 57% |
| Charge request clears | 60% |
| Regeneration taper begins | 70% |
| Hard upper boundary | 80% |

The charge request is latched. It sets at or below 45% and remains set until SOC reaches 60%. Charging power tapers above the preferred 57% target; it does not chatter around a single threshold.

- Maximum battery discharge: 32 kW, tapered to zero from 45% to 40%.
- Maximum battery charge: 24 kW, tapered to zero from 70% to 80%.
- Charge efficiency: 91%.
- Discharge efficiency: 94%.
- Nominal high-voltage accessory load: 0.45 kW.
- At the hard lower boundary, normal EV propulsion is removed. A separately reported, bounded start reserve may finish the engine crank without pulling the displayed usable buffer below 40%.

Battery energy is integrated from limited internal power, then SOC is derived from energy. The controller does not calculate an impossible battery power and hide it with SOC clamping.

## Engine state machine

```text
OFF → CRANKING → FUELED → STOPPING → OFF
  ↘ SPINNING_UNFUELED ↗
```

- `OFF`: no combustion torque; minimum-off timer is active.
- `CRANKING`: MG1 motors the engine for 0.75 seconds; combustion torque is zero.
- `FUELED`: torque follows a rate-limited educational curve capped by 142 Nm and 73 kW.
- `SPINNING_UNFUELED`: used for B-mode pumping loss and MG1 overspeed protection.
- `STOPPING`: 0.45-second RPM transition before `OFF`.
- Minimum fueled run time is 4 seconds and minimum off time is 2 seconds.
- Coolant temperature warms while fueled and cools toward 20°C while off. A latched warm-up request starts below 50°C and clears at 58°C.

## Power allocation

No fixed engine-power percentages are used. At every substep the controller:

1. Resolves wheel, ring, carrier, MG1, and MG2 speeds from rigid ratios.
2. Determines wheel demand, braking allocation, battery target, and machine limits.
3. Chooses a feasible engine torque on the educational torque/power curve.
4. Uses planetary torque reaction and signed member speeds to calculate MG1 mechanical power.
5. Solves MG2 mechanical power as the remaining amount required to close the drivetrain balance.
6. Converts both machine ports through motor and inverter efficiencies.
7. Reduces traction, generation, or regeneration before integration if battery or machine limits would be exceeded.

During low-SOC driving, requested engine power includes wheel demand, losses, accessories, and an SOC-dependent charging objective. Driver propulsion takes priority near full accelerator; the controller reduces or removes the charging objective instead of imposing a large generator load.

## Gear counts and ratios

### Power split

- Sun / MG1: 30 teeth.
- Planets: 24 teeth.
- Ring / output: 78 teeth.
- Geometry check: `78 = 30 + 2 × 24`.

### MG2 reduction teaching set

- Sun / MG2: 22 teeth.
- Planets: 18 teeth.
- Ring / output: 58 teeth.
- Carrier: fixed to housing.
- Geometry check: `58 = 22 + 2 × 18`.
- Reduction magnitude: `58 / 22 = 2.636:1`.
- Final drive: 3.267:1.

These selected tooth counts make the teaching geometry internally consistent and match the simulator's declared fixed-ratio magnitude. They are not claimed to be production tooth counts.

## Braking

Road load is never reported as hydraulic braking. Coasting has zero commanded friction-brake power. Driver braking is allocated among:

- MG2 regeneration, limited by speed fade, MG2 torque/power, inverter power, and battery acceptance;
- unfueled engine pumping loss in B mode;
- friction braking for all remaining demand and the final low-speed stop.

B mode retains available regeneration but adds engine braking for descent control; it is not presented as a stronger regeneration setting.

## Known simplifications

- No proprietary ECU calibration, emissions strategy, catalyst model, cabin-heat request, battery temperature model, or cell voltage/current model.
- Engine BSFC, motor efficiency, inverter efficiency, and tyre behavior use smooth educational approximations rather than production maps.
- The 3D cutaway omits bearings, lubrication, helical tooth form, manufacturing clearances, and exact production packaging.
- The selected tooth counts and ratios form a self-consistent teaching representation, not a parts-catalogue specification.
- Differential cornering is a visual demonstration; there is no steering/yaw vehicle model.
- ABS, tyre slip, traction control, suspension, and individual wheel dynamics are outside scope.
