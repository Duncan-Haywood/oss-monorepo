# Electronics and pin map

Both robots share one architecture: a Raspberry Pi 5 for vision and
planning, an ESP32 for real-time motor control and safety, a 24 V
LiFePO4 battery, and a hard-wired emergency stop that cuts motor power
independently of any software.

```
            +-------------------+   UART 115200 (protocol.py)   +-----------------------+
 cameras -->|  Raspberry Pi 5   |<----------------------------->|  ESP32 (firmware/)     |
            |  tennisbots       |                               |  speed/position loops  |
            +---------+---------+                               |  watchdog, e-stop sense|
                      | 5 V 5 A buck                            +-----+-----------+-----+
                      |  [2 A]                                        |           |
 24 V LiFePO4 --[30 A]--+--[e-stop contactor]--+--[fuse block]--+-- ESCs / H-bridge --+
                        |                       |
                        +--[relay]--[4.7 ohm]---+   precharge (2026-11-14)
                        |                       |
                        +-----------|<|---------+   regen return Schottky (2026-11-14)
                                                             +-- lift, agitator, stepper driver
                                                             +-- shuttle servo (via 6 V buck) ---+
```

The Pi's buck takes its supply between the main fuse and the contactor, so the
Pi and the ESP32 stay powered through an e-stop and can report it. Every motor
branch is after the contactor.

The e-stop is a normally-closed mushroom switch in series with the
contactor coil: pressing it (or a broken wire) opens the contactor and
de-energises every motor. Since 2026-11-14 the switch feeds two coils: a
small precharge relay, which closes at once and charges the switched bus
through a 4.7 ohm resistor, and a 0.5 s on-delay timer module, which then
closes the contactor's coil. Pressing the e-stop drops both. The wireless
e-stop relay stays in series ahead of them. The ESP32 also reads the switch (GPIO 4) so it
latches a software e-stop and reports it in telemetry; clearing needs the
button released *and* a `CLEAR_ESTOP` command.

## ESP32 pins, feeder role

| GPIO | Function |
| --- | --- |
| 25 | ESC, top launcher wheel (50 Hz servo pulse) |
| 26 | ESC, bottom launcher wheel |
| 34 | Tachometer, top wheel (IR reflective, 1 pulse/rev) |
| 35 | Tachometer, bottom wheel |
| 27 | Elevation actuator: servo pulse (`ELEV_MODE = "rc"`) or H-bridge PWM (`"pot"`, `"timed"`) |
| 23 | Elevation H-bridge DIR (`pot`, `timed`) |
| 39 | Elevation feedback pot wiper (`pot`; input-only, ADC1, 0-3.3 V: power the pot from 3.3 V; 100k wiper to GND) |
| 14 / 21 | Azimuth stepper driver STEP / DIR (NEMA 17, 10:1 gear sector) |
| 22 | Azimuth home switch (to GND, pull-up: low = at home, about -32 deg) |
| 5 | Azimuth stepper driver EN (active low; 4.7k pull-up to 3.3 V keeps the driver off through reset; low only once the contactor is closed) |
| 15 | Contactor coil sense (PC817 across the coil through 10k, transistor to GND, pull-up: low = coil energised) |
| 13 | Feed gate servo |
| 32 / 33 | Base motor driver PWM / DIR (both driven wheels on one channel) |
| 18 / 19 | Base encoder A / B |
| 4 | E-stop sense (NC switch to GND, pull-up: high = pressed) |
| 36 | Battery voltage via 100k/10k divider |
| 12 | Ball lift gearmotor MOSFET (PWM). The module must pull its input down: GPIO 12 high at reset makes the ESP32 pick 1.8 V flash and not boot |
| 2 | Hopper agitator gearmotor MOSFET (PWM; low through reset, so the motor stays off while the board boots) |
| 17 / 16 | UART2 TX / RX to the Pi |

Until 2026-11-14 the lift and agitator were on GPIO 16 and 17, the UART's
own pins: the UART, opened last, took them back, so neither motor would have
turned. `tests/test_pins.py` now loads `firmware/esp32/main.py` against a fake
board and fails on any pin claimed twice, a flash or input-only pin driven, a
strapping pin that floats high at boot, or a feeder pin missing from this table.

## ESP32 pins, collector role

| GPIO | Function |
| --- | --- |
| 32 / 33 | Left drive PWM / DIR |
| 18 / 19 | Left encoder A / B |
| 25 / 26 | Right drive PWM / DIR |
| 21 / 22 | Right encoder A / B |
| 27 | Pickup roller MOSFET gate (PWM) |
| 13 / 14 | Bumper switches left / right (to GND, active low) |
| 23 | Hopper-full IR break beam (active low) |
| 4 | E-stop sense |
| 36 | Battery voltage |
| 17 / 16 | UART2 TX / RX to the Pi |

Pins 34-36 are input-only on the ESP32 and have no internal pull-ups; the
tachometer modules drive them directly. Avoid the strapping pins (0, 2,
5, 12, 15) for anything that is pulled at boot.

## Power budget (estimate, not measured)

| Load | Feeder | Collector |
| --- | --- | --- |
| Launcher wheels (spin-up peaks ~300 W, holding speed much less) | ~100 W average | - |
| Base / drive motors | ~40 W average | ~30 W average |
| Pi 5 + cameras | ~12 W | ~10 W |
| ESP32, servos, sensors | ~8 W | ~5 W |
| **Total** | **~160 W** | **~45 W** |
| 24 V 20 Ah LiFePO4 (~510 Wh) runtime | **~3 h** | **~10 h** |

Measure your build with an inline power meter and update this table.

## Wiring notes

- **Cables to the head (2026-11-13):** every driver stays on the deck, and
  the head's wires rise on the turntable axis, twist there, and make one
  free loop to a clip on the head's rear lower standoff. Cut the loop to the
  manifest's `cable_cut_mm` (376 mm), keep it loose in a spiral wrap, and
  keep ties off the run between the axis clamp and the gland
  (`cad/README.md`, "Cables to the head").
- **Servo supply:** a 6 V 5 A buck on the deck, with 20 AWG supply and
  return to the servo. A stock 26 AWG servo extension over the 1.8 m run
  lifts the servo's ground about 0.58 V at stall, which leaves a 3.3 V
  signal little margin. Standard-size servos of this class are rated to about
  6.8 V, so do not run them from a 7.4 V BEC.

- **Deck-side run (2026-11-14):** from the electronics along the deck, up
  the +y rear mast post's inner face, under the crossbar and the clamp arm,
  and up into the axis clamp (`cad/README.md`, "Deck-side cables"). Cut the
  head's wires 789 mm from their deck terminals to the clamp. The azimuth
  stepper's StepStick driver sits on a printed carrier on the deck's M3 grid
  (STEP/DIR on GPIO 14/21, EN on GPIO 5 with a 4.7k pull-up to 3.3 V, 100 uF across 24 V; see "Stepper ENABLE after the contactor" below); its coils run
  874 mm of 22 AWG with the home switch's 26 AWG pair. The lift gearmotor's
  lead is 916 mm of 20 AWG. Twist each tachometer pair: they share the
  bundle with the launcher phases.

- Fuse the battery positive within 15 cm of the terminal (feeder 30 A,
  derived below; collector ~15 A).

## Fuses and branch wiring, feeder (2026-11-14)

From `cad/otr_cad/params.py` `Feeder.power_distribution` (the manifest's
"power" line). Currents are at the 24 V low-battery cut and come from assumed
part figures (each one is listed in the parameters: read your datasheets).
Each branch fuse is the smallest standard rating at or above 1.25 times its
running current, and at or above half its stall current, because a motor
starts at stall current for a few milliseconds. Its wire is the thinnest gauge
that carries the fuse's rating (from a conservative table, `AWG_AMPS`), and
never thinner than 20 AWG.

| Branch | Running | Fuse | Wire |
| --- | --- | --- | --- |
| Launcher ESC, top | 6.4 A | 15 A | 16 AWG |
| Launcher ESC, bottom | 6.4 A | 15 A | 16 AWG |
| Dual H-bridge: base (two gearmotors) and elevation | 6.0 A | 7.5 A | 20 AWG |
| Lift gearmotor MOSFET | 2.0 A | 3 A | 20 AWG |
| Agitator gearmotor MOSFET | 0.8 A | 1 A | 20 AWG |
| Azimuth stepper driver | 0.3 A | 1 A | 20 AWG |
| Servo buck, 6 V | 0.8 A | 2 A | 20 AWG |
| Pi buck, 5 V (before the contactor, inline holder) | 0.6 A | 2 A | 20 AWG |
| **Battery feed, main fuse and contactor** | **23.3 A** | **30 A** | **12 AWG** |

- **Every load at once draws 23.3 A**, the worst case of a drill starting: both
  wheels spinning up while the base moves and the head aims. That is under 80%
  of an assumed 30 A BMS continuous limit (24.0 A). If your BMS allows less,
  the build's check names the `WHEEL_SPINUP_W` that fits.
- **The ESCs draw what the firmware's ramp allows.** The ramp caps each wheel at
  100 W of shaft power while it spins up, which is 6.4 A at the battery. Without
  it, a wheel starting from rest could draw the motor's 1 kW peak: 49 A per
  ESC. Each ESC fuse is twice the ramped draw, because the speed loop's
  recovery after each ball is not modelled. Use slow-blow fuses there if
  normal ones open during a drill.
- **The contactor** must be rated 30 A DC or more at 24 V (its coil on 24 V,
  through the NC mushroom switch), so the main fuse protects it.
- **The battery feed:** 12 AWG, about 0.6 m each way, drops 0.15 V at 23.3 A.
- **Precharge (2026-11-14, `Feeder.contactor_inrush`, the manifest's
  "inrush" line).** Closing the contactor straight onto the ESCs' empty input
  capacitors is a short through the loop's few tens of milliohms. On assumed
  figures (40 mOhm pack, 1,000 uF per ESC, 0.68 uH loop) at the charger's
  29.2 V it peaks near 394 A after about 31 us, 13 times the contactor's
  30 A rating, and stays over an assumed 150 A BMS short-circuit trip for
  170 us. Across 27 combinations of pack resistance, ESC capacitance and loop
  inductance (`tests/inrush_sweep.py`) it peaks at 242 to 589 A and outlasts an
  assumed 200 us BMS delay in 9, which would cut the Pi too. The fuses do not
  care: the pulse's I^2 t is about 15 A^2 s in all, under 4 in each ESC fuse.
  With the precharge the relay makes about 6 A, the bus is within 1.4 V of
  the pack after 0.5 s (45 time constants; what is left is the idle loads'
  assumed 0.3 A across the resistor), and the contactor makes about 20 A
  (29 A at worst in the sweep). The resistor takes about 1 J per closing. If
  the bus is shorted it takes 181 W for the 0.5 s delay, 91 J, before the
  contactor closes onto the short and the fuses open: choose one rated for that
  pulse or one that fails open. Every figure but the charger's voltage is an
  assumption: put a current clamp and a scope on the first closing, and read
  your BMS's short-circuit settings.
- **Loads that start during the precharge (2026-11-14, `Feeder.precharge_bus`).**
  The 20 A above assumes the switched loads idle at 0.3 A while the bus
  charges. A buck or a stepper driver draws constant power once it starts
  (assumed at 8 V), and 4.7 ohm can pass at most 30 W into the bus at 24 V.
  The firmware used to pulse the shuttle servo from power-up, so a servo
  stopped mid-stroke by an e-stop sought home at stall (about 20 W) while the
  bus charged: at 24 V that held the bus near 8 V and the contactor would make
  about 223 A (136 to 328 A across the sweep). Since 2026-11-14 the servo gets
  no pulse until a FEED, and rests unpowered at the crank's dead centres. The
  azimuth stepper driver held from power-up while its ENABLE was tied to GND:
  about 8 W, so the contactor made about 45 A at 24 V (28 to 66 A across the
  sweep, over an assumed 60 A with a 20 mOhm pack).
- **Stepper ENABLE after the contactor (2026-11-14, `Feeder.contactor_bounce`,
  firmware `controller.PowerGate`).** The driver's EN goes to GPIO 5 with a
  4.7k pull-up to 3.3 V (off through reset; remove any pull-down the driver
  board puts on EN). A PC817 optocoupler's LED goes across the contactor's
  coil through a 10k resistor, its transistor from GPIO 15 to GND. The
  firmware pulls EN low only once the coil has been on for 150 ms
  (`CONTACTOR_SETTLE_MS`, longer than an assumed 50 ms pull-in and 10 ms
  bounce), and lets it go the moment the coil drops; a dropped coil also halts
  the board, clears the feed queue and makes the azimuth home again, and
  telemetry sets `FLAG_BUS_OFF` (1024). With nothing starting during the
  precharge the contactor makes about 20 A (12 to 29 A across the sweep).
  A 10 ms contact bounce re-closes onto under 1 V (about 12 A), because the
  precharge relay holds the bus while the contacts are open. The coil sense
  also catches a wireless e-stop the board would otherwise not see.
- **Regenerative braking (2026-11-14, `Feeder.regen_braking`, the manifest's
  "regen" line).** The firmware lowers a wheel's speed at the same 100 W it
  spins up with, and most ESCs follow a lower throttle by braking, which
  puts up to about 170 W back on the bus (6 A for both wheels). Into the
  pack that is fine. Into a bus the pack is not taking it is not: if the
  e-stop opens the contactor mid-brake, the ESCs keep braking for tens of
  milliseconds (until their next 50 Hz pulse), and about 6 J into the bus's
  2,300 uF passes the H-bridge's 30 V rating in under 1 ms. So fit a
  **Schottky diode (45 V 20 A class) across the contactor and the precharge
  relay**, anode on the switched bus, cathode between the main fuse and the
  contactor. It returns braking current to the pack with the contacts open
  (the bus stays near 28.4 V) and cannot power the bus from the pack, so the
  e-stop still cuts every motor. A full pack refuses charge too: braking at
  29.2 V would lift the highest cell past an assumed 3.65 V BMS cut, so the
  firmware coasts instead of braking when the battery reads above 27.6 V
  (`REGEN_BRAKE_MAX_MV`). If your BMS blocks charging when cold, set
  `WHEEL_BRAKE = False` so the wheels always coast. Set the ESCs' brake at
  zero throttle off.
- **Not modelled:** every load's real current, and how hard your ESC really
  brakes. Log the battery current on the first build with an inline meter,
  and scope the bus on a 20% slow-down.
- Common ground between the Pi, ESP32, ESCs and drivers; run the UART on a
  short twisted pair.
- ESCs: calibrate the throttle range once, with the wheels removed.
- Keep motor wiring away from the camera ribbon cables.
