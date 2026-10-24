# Electronics

## Block diagram

```
 7S Li-ion 25.2 V 5 Ah ── BMS ── 20 A fuse ── main switch ──┬── blade relay (NO) ── ESC 30 A ── outrunner
 (BMS cuts at its own limits)                               │        ▲  (NC contacts short the motor phases)
                                                            │        │ coil: 24 V via the stop button (NC)
                                                            │        │       and a MOSFET on GPIO 13
                                                            ├── dual motor driver 10 A/ch ── 2 x gearmotor + encoder
                                                            ├── 3 A fuse ── 5 V 5 A buck ── Raspberry Pi ── USB ── RTK GNSS receiver ── antenna
                                                            │                                    │
                                                            │                                    └── UART 115200 ── ESP32
                                                            └── divider 100k/10k ── ESP32 GPIO 36 (battery)
 Dock contacts ── diode ── battery + (charging) ; optocoupler ── ESP32 GPIO 4 (charging)
```

The **stop button is in series with the blade relay coil**, so pressing it
opens the relay whatever the firmware is doing. With the relay open, the
ESC is disconnected and the relay's normally-closed contacts short the
motor phases: a dynamic brake that needs no electronics and still works if
the ESC has failed. The firmware also sees the button (GPIO 14) and
latches a stop of the wheels.

## ESP32 pin map

| GPIO | Use | Notes |
| --- | --- | --- |
| 25 / 26 | left motor PWM / DIR | 20 kHz |
| 32 / 33 | right motor PWM / DIR | |
| 18 / 19 | left encoder A / B | |
| 5 / 23 | right encoder A / B | |
| 27 | blade ESC signal | 50 Hz RC pulse, 1000-2000 us |
| 13 | blade relay MOSFET gate | high = ESC connected |
| 34 | blade tach (hall sensor on the hub) | input only |
| 14 | stop button sense | NC switch to GND, pull-up: open (1) = pressed or wire cut |
| 35 | lift (4 hall sensors, wired-OR) | input only, external pull-up |
| 39 | bump (same sensors' second output) | input only, external pull-up |
| 15 | rain sensor | digital output of the sensor board |
| 4 | charging (optocoupler from the dock contacts) | |
| 36 | battery voltage | 100k / 10k divider, 11 dB attenuation |
| 21 / 22 | I2C SDA / SCL | BNO085 IMU |
| 16 / 17 | UART2 RX / TX | to the Pi |
| 2, 12 | free | for perimeter-wire coil sensors (12 must be low at boot) |

The four 3-axis hall sensors talk I2C. In v0.1 a small helper (a second
microcontroller or the sensors' own interrupt outputs with thresholds set
at start-up) turns their readings into the two wired-OR lines `lift` and
`bump`. That keeps the ESP32's safety loop to plain digital reads. The
helper is not designed yet.

## Power budget (flat grass, 0.35 m/s, `mowerbot runtime`)

| Load | Watts | Basis |
| --- | ---: | --- |
| Drive | 7.1 | 9.5 kg, rolling resistance 0.12 (assumed), 55% battery-to-wheel |
| Blade | 18.6 | 10 W spinning in air (assumed) + 60 J per m² cut (assumed), 80% motor + ESC |
| Electronics | 7.0 | Pi lightly loaded, GNSS, ESP32, IMU (estimate) |
| **Total** | **32.7** | **~3.1 h** on 80% of 126 Wh |

Every coefficient is a planning assumption. Log the battery current over
a real mowing session and pass the measured figures back in
(`mowerbot runtime --crr ... --cut-energy ...`).

## Wiring notes

- Size the battery-to-ESC and battery-to-driver leads for 20 A (1.5 mm² /
  16 AWG at these lengths), the rest for 3 A.
- Keep the blade motor's three phase leads short and twisted; they carry
  the braking current too.
- Ground the GNSS antenna's ground plane to the tray, and keep the ESC and
  its leads away from the antenna cable.
