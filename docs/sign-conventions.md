# Sign conventions

These conventions are authoritative for simulation code, telemetry, tests, and both visual modes. Signed RPM is retained internally; `Math.abs` is used only for magnitudes displayed or for symmetric limits.

## Coordinate and vehicle direction

- Positive vehicle speed is forward.
- Negative vehicle speed is reverse.
- Positive wheel torque acts in the forward direction; negative wheel torque acts in reverse or opposes forward travel.
- Road-load forces oppose current motion. Road grade is positive uphill in the forward coordinate.

## Battery and DC bus

- Positive battery terminal power means the high-voltage battery is discharging into the DC bus.
- Negative battery terminal power means the high-voltage battery is charging from the DC bus.
- Positive machine electrical power means the machine consumes electrical power.
- Negative machine electrical power means the machine generates electrical power.
- Accessory and inverter losses are positive sinks.

The reported DC balance is:

```text
battery terminal power
+ protected engine-start reserve power
- MG1 electrical power
- MG2 electrical power
- accessory power
- inverter loss
= electrical residual
```

The protected engine-start reserve is used only if a crank must finish at the 40% usable-SOC boundary. It is outside the displayed usable buffer, cannot propel the wheels, is limited to the cranking transient, and therefore does not reduce displayed SOC below 40%.

## Mechanical ports

For the engine and both motor-generators:

```text
mechanical power = signed torque × signed angular velocity
```

- Positive component mechanical power means that component delivers power to the mechanical drivetrain network.
- Negative component mechanical power means that component absorbs power from the network.
- Positive drivetrain wheel power means the transaxle delivers power to the wheels.
- Negative drivetrain wheel power means the wheels deliver power back into the transaxle for regeneration or engine braking.
- Drivetrain, engine-pumping, aerodynamic, rolling, motor, inverter, and friction-brake losses are reported as positive dissipated magnitudes.

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

Friction braking acts at the road wheels and is not passed through the transaxle balance. Aerodynamic and rolling losses act on the vehicle body and are likewise reported outside the transaxle mechanical balance.

## Required sign examples

| Condition | MG2 mechanical | MG2 electrical | Battery | Vehicle |
|---|---:|---:|---:|---|
| Forward EV drive | positive | positive | positive | accelerates forward |
| Forward regeneration | negative | negative | negative | slows |
| Reverse EV drive | positive because torque and RPM are both negative | positive | positive | accelerates backward |
| MG1 generation | negative | negative | may be negative after loads | engine surplus charges or feeds MG2 |
| MG1 engine start | positive | positive | positive, except protected boundary reserve | engine RPM rises before fueling |

## Kinematic signs

The power-split relationship is evaluated without independent RPM clipping:

```text
Nr × ringRPM + Ns × sunRPM = (Nr + Ns) × carrierRPM
```

MG1 is the sun, the engine is the carrier, and the output is the ring. If a stopped carrier and forward ring impose negative MG1 RPM, that negative sign is preserved. If the MG1 limit would be exceeded, carrier/engine speed is changed and the equation is solved again.

MG2 remains rigidly tied to wheel speed:

```text
MG2 RPM = wheel RPM × 3.267 × (58 / 22)
```

The maximum valid road speed is derived from the 13,500 RPM MG2 limit; MG2 RPM is never clipped while leaving road speed unchanged.
