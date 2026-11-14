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
                      |                                               |           |
 24 V LiFePO4 --[fuse]--[e-stop contactor]--+-- ESCs / H-bridges -----+           |
                                            +-- shuttle servo (via 6 V buck) -----+
```

The e-stop is a normally-closed mushroom switch in series with the
contactor coil: pressing it (or a broken wire) opens the contactor and
de-energises every motor. The ESP32 also reads the switch (GPIO 4) so it
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
  (STEP/DIR on GPIO 14/21, EN to GND, 100 uF across 24 V); its coils run
  874 mm of 22 AWG with the home switch's 26 AWG pair. The lift gearmotor's
  lead is 916 mm of 20 AWG. Twist each tachometer pair: they share the
  bundle with the launcher phases.

- Fuse the battery positive within 15 cm of the terminal (feeder ~30 A,
  collector ~15 A).
- Common ground between the Pi, ESP32, ESCs and drivers; run the UART on a
  short twisted pair.
- ESCs: calibrate the throttle range once, with the wheels removed.
- Keep motor wiring away from the camera ribbon cables.
