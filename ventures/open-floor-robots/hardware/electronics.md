# Electronics and pin map

One board set for all three builds: a Raspberry Pi Zero 2 W plans and
localises, an ESP32-S3 runs the wheels and enforces every safety rule, and
a PCA9685 PWM board drives the cleaning tools behind a hardware enable
line the ESP32 holds.

```
 lidar (UART) --> +--------------------+   UART 115200 (protocol.py)   +------------------------------+
 IMU (I2C) -----> | Pi Zero 2 W        |<----------------------------->| ESP32-S3 (firmware/esp32)    |
                  | floorbots planner  |                               | wheel speed loops, watchdog, |
                  +---------+----------+                               | bumper, cliff, wheel drop,   |
                            | 5 V 3 A buck                             | battery, temperature         |
                            |                                          +--+-----------+----------+----+
 4S2P Li-ion --[BMS]--[7.5 A fuse]--[power switch]--+-- 2 x DRV8871 ------+           |          |
     (14.4 V nominal, 16.8 V full)                  |   (left / right wheel)          | I2C      | OE (pulled up = off)
                                                    +-- MOSFETs: brush, side brush, pump, vibration <-- PCA9685
                                                    +-- fan (own driver, PWM speed input) <------------- PCA9685 ch 0
                                                    +-- servos (5 V from the buck) <-------------------- ESP32 GPIO 37
```

**The hard cut is the power switch**, on the battery side of everything.
The deck's stop button is a normally-closed switch read by the ESP32: open
(pressed, or a cut wire) latches an e-stop that stops every motor in the
next loop tick and needs the button released *and* a `CLEAR_ESTOP` command
to clear. The PCA9685's output-enable pin has a pull-up, so the cleaning
tools are off from power-on until the firmware deliberately enables them,
and `stop_all()` disables them in hardware as well as setting zero duty.

## ESP32-S3 pins

Board: ESP32-S3-DevKitC-1 with the N8 module (no PSRAM, so GPIO 35-37 are
free). Avoid the strapping pins 0, 3, 45 and 46.

| GPIO | Function |
| --- | --- |
| 17 / 18 | UART1 TX / RX to the Pi |
| 4 / 5 | Left wheel DRV8871 IN1 / IN2 (PWM forward / reverse) |
| 6 / 7 | Right wheel DRV8871 IN1 / IN2 |
| 11 / 12 | Left encoder A / B |
| 13 / 14 | Right encoder A / B |
| 8 / 9 | I2C SDA / SCL to the PCA9685 |
| 10 | PCA9685 OE (10k pull-up to 3.3 V: high = all tool outputs off) |
| 37 | Pad-lift servos (both on one signal) |
| 1 | Battery voltage via 50k/10k divider (16.8 V full reads 2.8 V) |
| 2 | 10k NTC thermistor taped to the battery pack (the DRV8871s have their own thermal shutdown) |
| 15 | Stop button (NC to GND, pull-up: high = pressed) |
| 16 / 21 | Bumper switches left / right (to GND when pressed) |
| 38 | Wheel-drop switches, two NC in series (high = a wheel dropped) |
| 39, 40, 41, 42 | Front cliff sensors (digital out, high = no floor) |
| 47, 48 | Rear cliff sensors |
| 35 | Bin reed switch (low = bin in place) |
| 36 | Tank float switch (low = empty) |

## PCA9685 channels (1 kHz)

| Channel | Load | Driver |
| --- | --- | --- |
| 0 | Fan speed input | the fan's own controller |
| 1 | Main brush motor | logic-level MOSFET + flyback diode |
| 2 | Side brush motor | MOSFET + diode |
| 3 | Pump | MOSFET + diode |
| 4 | Vibration motor | MOSFET + diode, through a resistor or a 3 V buck: it is a 3 V motor |

## Power budget (planning assumptions, not measurements)

| Load | Vacuum | Mop | Combo |
| --- | ---: | ---: | ---: |
| Pi, lidar, ESP32, IMU | 4.0 W | 4.0 W | 4.0 W |
| Drive (hard floor, cruising) | 4.0 W | 4.0 W | 4.0 W |
| Fan | 20.0 W | | 20.0 W |
| Main brush | 4.0 W | | 4.0 W |
| Side brush | 1.0 W | | 1.0 W |
| Pump (at ~40% duty) | | 0.5 W | 0.5 W |
| Vibration | | 0.8 W | 0.8 W |
| Lift servos (holding) | | 0.2 W | 0.2 W |
| **Total** | **33 W** | **9.5 W** | **34.5 W** |
| Runtime on 54 Wh planned (75 Wh rated x 80% x 90%) | 98 min | 341 min | 94 min |

`floorbots runtime` prints this table from
[`src/floorbots/variants.py`](../src/floorbots/variants.py) and
[`power.py`](../src/floorbots/power.py). The fan figure matches the
`floorbots size-fan` operating point (21 W electrical at the default
assumptions). The mop's runtime is not its limit: its tank runs dry after
about 125 m^2 at 3 ml/m^2. Measure your own loads with a USB-C or DC power
meter and edit `variants.py`.

## Wiring notes

- Fuse the battery positive before the power switch (7.5 A blade fuse).
  The pack's BMS is the over-discharge and short-circuit protection; the
  fuse protects the wiring.
- 18 AWG for battery, fan and wheel motors; 24 AWG for sensors.
- Twist each encoder pair with its ground; keep motor leads away from the
  cliff sensor wiring.
- Common ground between the Pi, the ESP32 and the drivers. The UART is
  3.3 V on both sides; no level shifter.
- The charging contacts go to the charger input of the BMS (or a 4S
  charge board), never straight to the cells.
