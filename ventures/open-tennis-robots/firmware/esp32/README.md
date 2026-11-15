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

For drills, use `tennisbots run drill.json --port /dev/ttyAMA0`
(`src/tennisbots/host.py`; the main README's "Running a drill on the
machine"): it keeps the heartbeats up, waits for `FLAG_AIM_SETTLING` and
`FLAG_WHEELS_SETTLING` (512) to clear before each `FEED`, and waits for the
released-ball counter (`TELEMETRY`'s last byte, mod 256) to move before
re-aiming.

## Launcher wheels (2026-11-11)

Speed is timed per revolution (`controller.PeriodTach`); the old per-tick
pulse count could only read multiples of 6000 rpm. The loop is feedforward
plus PI (`controller.WheelLoop`): set `WHEEL_RPM_FULL` in `config.py` to the
wheel's free speed at full throttle, read with the tach and no ball. The feed
gate waits until both wheels have held within 3% for 150 ms
(`controller.SteadyGate`); telemetry sets `FLAG_WHEELS_SETTLING` until then.
Tuned on a simulated wheel (`tests/wheel_loop_sweep.py`), not a real one.

Since 2026-11-14 a new speed does not reach the loop at once: `controller.SpinupRamp`
moves each wheel's target at most `WHEEL_RAMP_MAX_RPM_S` per second, and above that
at `WHEEL_SPINUP_W` of shaft power (`WHEEL_INERTIA_KGM2` is one wheel and its rotor).
Two wheels spinning up together then stay inside the battery BMS's continuous limit
(cad `Feeder.power_distribution`). Weigh your wheel and update the inertia here and in
`cad/otr_cad/params.py`; a test fails if they disagree. A zero speed (stop, e-stop,
watchdog) still cuts the ESCs at once.

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
  Fit a 1 uF ceramic capacitor from GPIO 39 to GND at the board: the pot wires
  share a 1.39 m lead with the motor pair, and every PWM edge on the toggling
  motor wire pushes charge onto the wiper. With no capacitor a reading caught
  on an edge is at the rail (the old firmware called that a broken wire); with
  ESP-IDF's example 100 nF a reading is still up to 0.55 mm off, over the
  deadband (`cad/README.md`, "The pot's pickup from the motor pair"). Each tick
  takes `ELEV_POT_READS` (8) readings, drops the two highest and two lowest and
  averages the rest; a reading outside the span stops nothing on its own: the
  last duty is held and the axis faults on the third such tick in a row (30 ms),
  and those ticks still count toward the stall time. `tests/pot_pickup_sweep.py`
  runs this firmware against the pickup model.
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

**Azimuth homing (2026-11-12).** The home switch (GPIO 22 to GND) is held
closed by a cam on the gear sector at every angle at or below `AZ_HOME_DEG`
(`cad/README.md`, "Azimuth home switch"). If the switch is closed at power-up
the axis backs off toward positive angles until it opens, 2 deg more, then
creeps back and homes on the closing edge, so the home is always taken the same
way. It faults (`FLAG_AZ_UNHOMED` stays set, nothing moves) if the switch stays
closed for 12 deg of backing off, which is a stuck or shorted switch or a head
turned by hand past the sector's end, or if a seek runs 82 deg without a click.
Set `AZ_HOME_DEG` from your build: aim at a mark straight ahead after homing
and correct it by the error.

**Stepper ENABLE and the switched bus (2026-11-14).** The azimuth driver's EN
is on GPIO 5 with a 4.7k pull-up to 3.3 V, so the driver is off while the
board boots and while the bus precharges. An optocoupler across the
contactor's coil pulls GPIO 15 low while the coil is energised. Every
controller tick, e-stop or not, `FeederHw.bus_tick` feeds it to
`controller.PowerGate`: EN goes low once the coil has been on for
`CONTACTOR_SETTLE_MS` (150 ms, longer than the contactor's pull-in and bounce),
and high the moment it drops. A drop halts the board (the feed queue too) and
clears the azimuth's home, since an unpowered stepper holds nothing. Until the
bus is back and settled the board drives nothing, and telemetry sets
`FLAG_BUS_OFF` (1024); the Pi's drill runner waits for it to clear at connect
and aborts if it comes back mid-drill. The reasoning and numbers are in
`cad/README.md`, "Stepper ENABLE after the contactor, and contact bounce".

**Lift jam cutoff (2026-11-15).** `LiftRun.update(now, over)` takes the lift
comparator's output (GPIO 0, low over about 1.7 A since the slip hub, 2026-11-15). It ignores it for
`LIFT_JAM_BLANK_MS` (400 ms) after each start, cuts the motor when it reads
over on two ticks `LIFT_JAM_TRIP_MS` (10 ms) apart, rests `LIFT_JAM_REST_MS`
(2 s) and retries with a full run-on, `LIFT_JAM_RETRIES` (1) times. Then it
stays off and telemetry sets `FLAG_LIFT_JAM` (2048) until the switched bus
drops (someone pressed the e-stop to reach in); a watchdog, an ESTOP frame or
balls fed do not restart it. The drill runner logs the flag once and carries
on. Wiring: `hardware/electronics.md`, "Lift jam cutoff"; numbers:
`cad/README.md`, "Lift jam cutoff", and `tests/lift_jam_sweep.py`.

**Lift soft start (2026-11-15).** Every lift start, the first and each retry
after a trip, ramps the duty from 10% to `LIFT_DUTY` over `LIFT_RAMP_MS`
(100 ms) in 10 ms ticks, inside the 400 ms jam blanking. The jaw coupling
between the gearmotor and the drive shaft is a spring with free play; a
switched start rang it to 2.3 times the start torque and, with a hard, worn
spider, slipped the pulley's hub on an empty belt. `LIFT_RAMP_MS = 0` gives the
old switched start. Numbers: `cad/README.md`, "Lift coupling dynamics".

**Lowering a wheel's speed: brake or coast (2026-11-14).** `SpinupRamp` lowers
a target at the same capped power it raises one, so an ESC that brakes sends
up to about 170 W back to the pack. `FeederHw.update` allows that only while
the battery reads at or under `REGEN_BRAKE_MAX_MV` (27,600 mV) and
`WHEEL_BRAKE` is True. Otherwise the ramp coasts: it sets `coasting`, follows
the wheel's measured speed down, and the board sends zero throttle until the
wheel reaches its target, then the speed loop takes over (a throttle matching
the wheel's speed would only hold it there). Braking into a nearly full pack
lifts a cell to the BMS's cut, after which the energy has nowhere to go but
the bus. Set the ESCs' brake at zero throttle off; a stop and an e-stop
coast. Numbers: `cad/README.md`, "Regenerative braking".

**Brakes in a row (2026-11-14).** The guard is `controller.BrakeGuard`, with a
band: once a reading passes `REGEN_BRAKE_MAX_MV` braking stays off until the
pack reads under that less `REGEN_BRAKE_HYST_MV` (700 mV). Braking lifts the
reading it is judged by (about 260 mV of charge current across the pack-side
resistance), so the first, single-threshold guard flipped between braking and
coasting on every 10 ms tick, about 126 times in one slow-down, for any pack
resting between about 27.2 and 27.8 V. Numbers: `cad/README.md`, "Brakes and
bounces in a row".

Whatever the mode, the feed gate now waits for the aim: a ball is released only
when the wheels are within 5% of their speeds **and** both the elevation and
the azimuth have arrived. Telemetry sets `FLAG_AIM_SETTLING` (128) while either
is moving or homing, so the Pi can time its next shot. Tested on a simulated
actuator (`tests/test_robots.py`, `test_elevation_*`); not yet run on a board
or a real actuator.
