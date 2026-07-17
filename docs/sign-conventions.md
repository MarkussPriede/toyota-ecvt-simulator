# Sign conventions

These conventions are authoritative for simulation code, telemetry, tests, and both visual modes. Signed RPM and torque are retained internally; absolute values are used only for magnitudes and symmetric limits.

## Coordinate and vehicle direction

- Positive vehicle speed is forward and negative speed is reverse.
- Positive wheel torque acts forward. Negative wheel torque acts in reverse or opposes forward travel.
- Road-load forces oppose current motion. Positive road grade is uphill in the forward coordinate.
- Neutral does not clamp velocity: a reversing vehicle continues coasting and gravity may roll a stationary vehicle backward.

## Battery and DC bus

- Positive battery terminal power means the usable high-voltage buffer is discharging into the DC bus.
- Negative battery terminal power means the usable buffer is charging from the DC bus.
- Positive machine electrical power means the machine consumes electricity.
- Negative machine electrical power means the machine generates electricity.
- Accessory and inverter losses are positive sinks.
- Positive protected-reserve power means the finite reserve below the displayed usable window is supplying an essential load.

The reported DC balance is:

```text
battery terminal power
+ protected reserve power
- MG1 electrical power
- MG2 electrical power
- accessory power
- inverter loss
= electrical residual
```

The protected reserve is an explicit 0.08 kWh energy state. It can cover the essential accessory load at the 40% usable boundary and the portion of a bounded engine-start transient that exceeds the usable-buffer discharge limit. It cannot propel MG2, is power-limited to 10 kW, and its energy is integrated and displayed separately.

## Mechanical ports

For the engine and both motor-generators:

```text
mechanical power = signed torque × signed angular velocity
```

- Positive component mechanical power means that component delivers power to the drivetrain network.
- Negative component mechanical power means that component absorbs power from the network.
- Positive drivetrain wheel power means the transaxle delivers power to the wheels.
- Negative drivetrain wheel power means the wheels deliver power back for regeneration or engine braking.
- Drivetrain, pumping, aerodynamic, rolling, motor, inverter, and friction losses are positive dissipated magnitudes.

The reported mechanical balance is:

```text
engine mechanical power
+ MG1 mechanical-port power
+ MG2 mechanical-port power
- drivetrain wheel power
- drivetrain loss
- engine pumping loss
= mechanical residual
```

Friction braking acts at the road wheels and is outside the transaxle balance. Aerodynamic, rolling, and grade forces act on the vehicle body.

## Required sign examples

| Condition | MG2 RPM | MG2 torque | MG2 mechanical | Battery | Vehicle |
|---|---:|---:|---:|---:|---|
| Forward EV drive | negative | negative | positive | positive | accelerates forward |
| Forward regeneration | negative | positive | negative | negative | slows |
| Reverse EV drive | positive | positive | positive | positive | accelerates backward |
| MG1 generation | signed by kinematics | opposes its rotation | negative | may be negative | engine surplus charges or feeds MG2 |
| MG1 engine start | signed by kinematics | same sign as rotation | positive | positive or reserve-assisted | engine RPM rises before fueling |

The MG2 signs differ from the road-output signs because MG2 is the sun of a fixed-carrier planetary reduction.

## Kinematic signs

The power-split relationship is evaluated without independent RPM clipping:

```text
Nr × ringRPM + Ns × sunRPM = (Nr + Ns) × carrierRPM
```

MG1 is the sun, the engine is the carrier, and the main output is the ring. If MG1 would exceed its limit, carrier speed is changed and the equation is solved again.

For the MG2 fixed-carrier reduction, MG2 is the 22-tooth sun and the 58-tooth ring is connected to the main output:

```text
58 × outputRingRPM + 22 × MG2RPM = 0
MG2RPM = -outputRingRPM × (58 / 22)
outputRingRPM = wheelRPM × 3.267
```

Forward road motion therefore produces negative MG2 RPM; reverse road motion produces positive MG2 RPM. The road-speed ceiling is derived from the absolute 13,500 RPM MG2 limit. MG2 RPM is never clipped while road speed is left unchanged.

## Display state

Vehicle motion and controller intent are independent stabilized fields:

- Motion: stationary, accelerating, cruising, coasting, braking, or reversing.
- Objective: engine off, starting, warm-up, propulsion, charging, assisting, engine braking, or MG1 protection.

This permits truthful combinations such as `Coasting` plus `Charging battery`, or `Reversing` plus `Engine warm-up`.
