# ESP32 firmware (MicroPython)

One firmware for both robots; `config.py` picks the role (`feeder` or
`collector`).

| File | What it does |
| --- | --- |
| `controller.py` | Board-independent logic: command dispatch, role filter, clamps, 300 ms watchdog, latched e-stop, bumper rule, 10 Hz telemetry. Unit-tested on CPython (`tests/test_robots.py`). |
| `main.py` | Hardware layer (PWM, encoders, tachometers, ADC, UART) and the main loop. **Not yet run on a board.** |
| `config.py` | Role, encoder scales, battery thresholds, azimuth and elevation drive settings. |
| `../../src/tennisbots/protocol.py` | The serial protocol, shared byte-for-byte with the Pi. |

## Flash

```
pip install mpremote
# flash MicroPython for ESP32 first (https://micropython.org/download/ESP32_GENERIC/)
mpremote cp ../../src/tennisbots/protocol.py controller.py config.py main.py :
mpremote reset
```

Bench-test with the launcher wheels removed (feeder) or the drive wheels
off the ground (collector). Check that pressing the e-stop and unplugging
the UART each stop every motor within 300 ms before anything else.

## Talking to it from the Pi

```python
import serial
from tennisbots import protocol as P

port = serial.Serial("/dev/ttyAMA0", 115200, timeout=0)
port.write(P.encode(P.SET_WHEELS, 4300, 2200))
port.write(P.encode(P.HEARTBEAT))   # at least every 300 ms, or the watchdog stops everything
frames = P.Decoder().feed(port.read(256))
```

For drills, `tennisbots play drill.json --port /dev/ttyAMA0` does all of this
(`src/tennisbots/play.py`, 2026-11-11). For each shot it sends `SET_WHEELS` and
`SET_AIM`, waits until telemetry has shown the aim settled (`FLAG_AIM_SETTLING`
and `FLAG_AZ_UNHOMED` clear) and both wheels within 2% for 300 ms, sends `FEED 1`,
then holds the aim until telemetry has stayed ready for 700 ms so the ball has
certainly gone before the next aim goes out. It ignores the first frame after a
new aim unless that frame already shows `SETTLING` (a frame built before the board
read the command can still be in flight), refuses shots outside -15..45 deg,
-30..30 deg or 7,000 rpm instead of letting the firmware clamp them, and stops the
wheels and the drill on e-stop, watchdog, elevation fault, an empty hopper, 500 ms
without telemetry or 20 s without a ready aim.

`tennisbots play drill.json --sim pot` (or `rc`, `timed`) runs the same player
against this firmware on a simulated board (`src/tennisbots/simboard.py`): `main.py`
and `controller.py` run unchanged on stub `machine` and `time` modules wired to a
plant model of the stepper, the actuator, the wheels and their once-per-turn tach
pulses, and every opening of the gate servo is logged with the aim the head really
had. It needs a source checkout. The plant's wheel numbers (full throttle 9,000 rpm,
0.3 s time constant) and the actuator speeds are assumptions, not measurements.

## Wheel tachometers: timed pulse to pulse (2026-11-11)

The first run of the simulated board found the feeder could never feed. `Tach`
counted pulses (one per turn) in each 10 ms update and multiplied by 6,000, so it
could only read 0, 6,000 or 12,000 rpm: at a 3,000 rpm target the reading flipped
between 0 and 6,000, the gate's "within 5%" check never passed, and the ball stayed
in the hopper. `Tach` now times the period between pulses in microseconds
(`time.ticks_us()` in the interrupt); in simulation it reads the wheel within 0.5%
(`tests/test_drill.py`). No pulse for 0.2 s reads as stopped.

What the simulated drills show (`drill.example.json`, 4 shots played 3 times, plant
assumptions above):

- the first ball waits for azimuth homing, 32 deg at 5 deg/s: 7.7 s;
- after that a shot takes 3.8 s on average in `rc` and `pot` mode, mostly the wheels
  changing speed (1.0 s between the two 22 m/s corner shots, which share wheel speeds;
  2.1 s for a 900 rpm change, 4.3-4.6 s for 1,300-3,400 rpm);
- `timed` mode averages 5.6 s: the move from the last shot back to the first pushes
  the error budget past 3 mm, so it re-homes once a round (12.3 s);
- with the Pi's band at 4% the balls landed up to 0.5-0.6 m from their targets,
  at 2% up to 0.2-0.3 m, at 1% 0.14-0.21 m, costing 0.6 s a shot per halving.
  The wheel band, not the aim, sets the scatter (the aim is within 0.25 deg); 2% is
  the default (`--rpm-tol`);
- without the 300 ms steady window a ball once left 381 ms after `FEED` with the top
  wheel 5.2% slow: the tach reports the last turn, so it lags a wheel still swinging
  toward its speed.

## Elevation actuator (2026-11-11)

The head tilts on a linear actuator (`cad/README.md`, "Elevation drive"), not a
servo. `SET_AIM` still takes the angle in centidegrees; the firmware turns it into
an actuator length through the same pin-and-anchor geometry as the CAD
(`controller.ElevationGeometry`, checked against `Feeder.elev_act_len` at every
degree from -40 to +70). Length is not linear in angle (0.43 deg/mm nose down,
0.53 nose up), so the old firmware's even spread of a servo pulse over -15..45 deg
would have aimed high by up to 1.46 deg (worst at +5 deg; 1.39 at +10). In the
flight model (`ballistics.simulate`, no spin, launched 1 m up) a 20 m/s drive at
+10 deg lands 15.2 m away and at +11.46 deg 16.2 m: a metre deep.

Pick what your actuator can report with `ELEV_MODE` in `config.py`:

| Mode | Actuator | Wiring | Position from |
| --- | --- | --- | --- |
| `rc` | own position loop with an RC servo input (Actuonix L16-R class) | pulse on GPIO 27 | the actuator; the firmware only estimates arrival time |
| `pot` (default) | feedback potentiometer (L16-P class), any H-bridge | PWM 27, DIR 23, wiper on 39 | the pot, read every tick |
| `timed` | bare actuator with internal limit switches, any H-bridge | PWM 27, DIR 23 | timing from the retract limit |

- **pot**: a proportional loop with a 0.5 mm deadband (about 0.25 deg) and a
  minimum duty to beat stiction. It faults (`FLAG_ELEV_FAULT`) when the pot
  reads outside its calibrated span (a wire off) or when the duty is on and the
  stroke moves less than 0.5 mm in 0.6 s (jammed, or no motor power). Measure
  `ELEV_POT_RAW_RETRACTED`/`EXTENDED` with `ADC(Pin(39)).read_u16()` at each end.
  A reading more than 1% of the span outside them counts as a broken wire, so put
  a 100k resistor from the wiper to GND (a loose wiper then reads 0) and check
  that neither end reads within about 2% of 0 or 65535, or the check cannot tell.
- **timed**: at power-up it retracts for 1.25x the full-stroke time plus 0.5 s
  and calls that stroke 0, which is past +45 deg. With the actuator the CAD first
  drew (240 mm retracted) that is +48.8 deg, and the head plates cut into the
  turntable and mast plates from +46.4 deg. The drawn actuator is now 246 mm
  retracted (stops at +45.8 deg); any between 244.9 and 247.7 mm works
  (`cad/README.md`, "Elevation drive"). The axis refuses timed mode (faults at
  start-up) when `ELEV_CLOSED_MM` would put the stop past +46.3 deg. In every
  mode this retract limit is the backstop if the loop or wiring goes wrong, so
  check your actuator's length whatever the mode. Each move runs at full speed and adds
  5% of its length to an error budget; a move that would push the budget past
  3 mm homes first if homing and moving out would leave less error. Measure
  both speeds (`ELEV_SPEED_EXT_MM_S` against the head's weight,
  `ELEV_SPEED_RET_MM_S` with it); in simulation a 2% speed error left a
  mid-range move within 1 deg, a 5% one 1.8 deg off. If your actuator back-drives
  with the power off, set `ELEV_SELF_LOCKING = False` and every stop re-homes.
- **rc**: the pulse is the stroke fraction (1.0 ms retracted, 2.0 ms extended),
  so the geometry is applied before the pulse. On a stop the pulse stops and the
  actuator holds.

Whatever the mode, the feed gate now waits for the aim: a ball is released only
when the wheels are within 5% of their speeds **and** both the elevation and
the azimuth have arrived. Telemetry sets `FLAG_AIM_SETTLING` (128) while either
is moving or homing, so the Pi can time its next shot. Tested on a simulated
actuator (`tests/test_robots.py`, `test_elevation_*`); not yet run on a board
or a real actuator.
