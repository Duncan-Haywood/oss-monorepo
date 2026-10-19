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
                                            +-- servos (via 6-7.4 V BEC) ---------+
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
| 27 | Elevation servo / actuator |
| 14 | Azimuth servo |
| 13 | Feed gate servo |
| 32 / 33 | Base motor driver PWM / DIR (both driven wheels on one channel) |
| 18 / 19 | Base encoder A / B |
| 4 | E-stop sense (NC switch to GND, pull-up: high = pressed) |
| 36 | Battery voltage via 100k/10k divider |
| 17 / 16 | UART2 TX / RX to the Pi |

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

- Fuse the battery positive within 15 cm of the terminal (feeder ~30 A,
  collector ~15 A).
- Common ground between the Pi, ESP32, ESCs and drivers; run the UART on a
  short twisted pair.
- ESCs: calibrate the throttle range once, with the wheels removed.
- Keep motor wiring away from the camera ribbon cables.
