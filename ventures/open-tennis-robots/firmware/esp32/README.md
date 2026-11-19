# ESP32 firmware (MicroPython)

One firmware for both robots; `config.py` picks the role (`feeder` or
`collector`).

| File | What it does |
| --- | --- |
| `controller.py` | Board-independent logic: command dispatch, role filter, clamps, 300 ms watchdog, latched e-stop, bumper rule, 10 Hz telemetry. Unit-tested on CPython (`tests/test_robots.py`). |
| `main.py` | Hardware layer (PWM, encoders, tachometers, ADC, UART) and the main loop. **Not yet run on a board.** |
| `config.py` | Role, encoder scales, battery thresholds, azimuth and elevation drive settings. |
| `capture.py` | Launcher tachs timed by MCPWM0's capture unit (opt-in, `TACH_CAPTURE`; "A tach timed in hardware"). **Not yet run on a board.** |
| `tach_log.py` | Logs one wheel's tach periods from the REPL for `tennisbots tach-jitter`, by the pin interrupt or the capture unit. |
| `../../src/tennisbots/protocol.py` | The serial protocol, shared byte-for-byte with the Pi. |

## Flash

```
pip install mpremote
# flash MicroPython for ESP32 first (https://micropython.org/download/ESP32_GENERIC/)
mpremote cp ../../src/tennisbots/protocol.py controller.py config.py main.py capture.py tach_log.py :
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

**Slip hub jam count, kept in flash (2026-11-16).** Every cut is a jam the
lift's slip hub slid through, and each slide wears its facings a little
(`cad/README.md`, "Slip hub wear": the disc stack keeps the hub in its band
for 300 jams after a bench set). A drill session holds a handful of jams at
most, so a count in RAM would restart at every power-up and never get there.
`controller.JamLog` keeps the count in a small file on the board's flash
(`LIFT_JAM_LOG`, default `lift_jams.json`): every cut, a retry's second cut
included, adds one, written to a `.tmp` file and renamed over the old one so
a power cut mid-write leaves the old count or the new one. Once
`LIFT_SLIP_JAMS` (300, the CAD's `lift_slip_jams`; a test fails if they
differ) cuts have passed since the last set, telemetry sets
`FLAG_LIFT_HUB_DUE` (4096). The lift still runs; the drill runner logs the
warning once. A file the board cannot read also sets the flag, since a lost
count must not hide a worn hub; a missing file is a new board and starts at 0.

After the hub is checked on the scale and set again, tell the board:

```
tennisbots lift-hub-reset --port /dev/ttyAMA0
```

It sends `RESET_LIFT_HUB` (0x14) with a fixed key (`RESET_LIFT_HUB_KEY`, so
a stray frame cannot zero the count), waits for a fresh telemetry frame with
the flag clear, and refuses while the e-stop is pressed. The reset zeroes the
count since the set and keeps the lifetime total. Tested on the simulated
board (`tests/test_host.py`, `LiftJamTest`), including a power cycle between
two boards sharing one flash file; not yet run on an ESP32.

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

## Empty hopper (2026-11-16)

Until now an empty tub ended a drill badly: the shuttle stroked an empty
pocket, the firmware counted it as a ball fed, and the Pi carried on until a
release timed out or the drill "finished" with shots that never flew.
`FLAG_HOPPER_EMPTY` (8) was defined but nothing set it.

The plan was a break-beam across the column. The feeder's ESP32 has no pin for
one: every GPIO a WROOM-32 module exposes is taken except 1 and 3, which are
UART0, the USB console that `mpremote` flashes over (`hardware/electronics.md`,
"ESP32 pins, feeder role"). So the firmware reads the sensor it already has:
the wheel tachometers.

**The physics.** A ball squeezed through the wheels takes its momentum from
them. The wheels' pushes add up to the ball's linear momentum `m v`, and their
difference times the ball's radius gives its spin, so each wheel loses
`J R / I` of its angular speed (`controller.launch_dips`). Slip and the felt's
heat do not enter, because this is momentum, not energy. With the CAD's ball
(57 g), wheel radius (75 mm) and wheel inertia (0.00155 kg m^2), and the
launcher's speed efficiency 0.85, a flat shot slows each wheel by 8.8%, at any
speed. Whatever the spin, the faster wheel slows by at least half that.

**The check.** `controller.LaunchCheck` starts when the forward stroke starts,
with the wheels' targets (they are held within 3% or the gate would not have
opened). It keeps the lowest single-revolution speed of each wheel
(`PeriodTach.rpm_last`: the 4-revolution mean shows only part of a drop at low
speed), and stops taking readings as soon as the targets change, so the Pi's
re-aim for the next shot, or the drill's final stop, cannot pass for a ball.
`LAUNCH_CHECK_MS` (250 ms) after the stroke ends it judges the wheel with the
larger predicted drop: a ball went if that wheel fell by at least
`LAUNCH_DIP_SHARE` (0.25) of its prediction, and by `LAUNCH_DIP_MIN` (1.5%) at
least, below its own speed just before the fall (since the evening of
2026-11-16; at first below its target, see "The verdict from the pre-ball
speed" below). A dry stroke sets `FLAG_HOPPER_EMPTY` until the next `FEED`.

**The Pi.** `run_drill` stops at the first dry stroke and reports the shot
that went dry and how many flew; `tennisbots run` exits 3. It stops the wheels
without latching the e-stop, since nothing is wrong with the machine: refill
and run again. After the last shot it waits for that shot's verdict before
reporting the drill done. An empty pocket and a bridged outlet or a stuck ball
look the same, and the message names all three.

**Margins (simulated).** `tests/launch_check_sweep.py` runs the real firmware
on the simulated feeder over six shots (flat 1,500, 3,000 and 6,500 rpm, heavy
topspin, heavy backspin, 7,000/2,500) and 27 builds that differ from config:
the true wheel inertia 0.7 to 1.5 times config's, the ball taking 60% to 100%
of the modelled momentum, and the wheel's spin-up lag 0.2 to 0.8 s. The Pi in
the sweep re-aims the very millisecond the release is counted, which a real Pi
(a telemetry frame every 100 ms) never beats.

| | worst case | measured drop / threshold |
| --- | --- | --- |
| Ball in the pocket (must be 1 or more) | wheel 1.5x heavier, 60% take, 0.2 s lag | 1.26 (4.7% drop on 5,000/1,500) |
| Empty pocket (must be under 1) | nominal wheel, 60% take, 0.8 s lag | 0.17 (0.37% drop at 3,000 rpm) |

Two runs before the threshold settled: with the 4-revolution mean and a share
of 0.4, a loaded stroke read as low as 0.47 of the threshold at 1,500 rpm on a
heavy wheel, because the Pi's re-aim ended the watch before the mean caught
up. The single-revolution reading and the lower share fixed both.

**Not measured.** The simulator's wheels are first-order lags and the momentum
leaves in one instant; a real ball's contact is a few milliseconds and the ESC
may answer faster or slower. Before relying on it, log `hw.launch.last_dip`
for a few dozen real shots and dry strokes on the first build and check they
sit either side of the threshold. `LAUNCH_CHECK = False` turns the check off.

### The verdict from the pre-ball speed (2026-11-16, later)

The first verdict measured the drop from the wheel's target. The sweep above
fed every stroke with the wheels already settled at the shot's speed, so the
wheel met the ball within a fraction of a percent of its target. A drill does
not always do that: when a shot's interval runs out before the wheels settle,
the Pi sends `FEED` within one telemetry frame of the steady flag, and the
stroke starts the moment the 3% gate opens, with the wheel still closing on its
target from below or above.

`tests/launch_check_sweep.py` now also feeds that way ("fed at the gate"): each
of the six shots, set from 0.5, 0.8, 1.25 or 1.5 times its speed (within the
planner's 500..7,000 rpm), then fed at once, one loaded and one dry stroke, on
the same 27 builds: 486 loaded and 486 dry strokes
(`eval/launch-check-gate-2026-11-16.txt`).

| fed at the gate, 27 builds | worst loaded (must be 1 or more) | worst dry (must be under 1) | wrong verdicts of 972 |
| --- | --- | --- | --- |
| drop below the target (the first verdict) | 0.59 | 3.11 | **29** (27 dry strokes read as a ball, 2 balls read as dry) |
| drop below the pre-ball speed (now) | 1.25 | 0.63 | **0** |

A dry stroke misread as a ball hides an empty tub, which the check exists to
catch. The target verdict did that once on every one of the 27 builds, each
time at 3,000 rpm set from 1.25 times it: braking from 3,750 rpm the simulated
wheel undershoots to 2,865 and is still about 2% under target, climbing, when
the gate opens. The two balls read as dry (6,500 rpm set from 0.5 and 0.8
times it, on the 1.5x wheel with a 0.8 s lag and a 60% take) would have
stopped a drill with balls left.

So the verdict now uses the drop the shot log already records: the wheel's
largest fall of one reading below the highest reading of the 2.5 revolutions
before it. `LaunchCheck.last_dip` is that drop and `last_dip_target` the old
one, for comparison. On settled feeds (the first table) the loaded margin is
unchanged (1.26); the dry margin is smaller, 0.42 of the threshold against
0.17, because the single-revolution reading's own ripple at 1,500 rpm now
counts as a fall (0.9%, against a 2.2% threshold). That is still 2.4 times
clear, and it is the noise a real tach will show more of: the shot log of a
first build should check it before anything else.

**Not measured.** The same simulator caveats as above, and the Pi's feed
timing taken at its worst (no frame of slack after the steady flag).

## Shot log (2026-11-16)

The empty-hopper check reads how far the wheels slow when a ball goes through.
That drop is the ball's momentum (`controller.launch_dips`), so it is also a
free momentum meter: with the wheel's inertia known it gives the ball's exit
speed, and so the launcher's speed efficiency, which until now only a radar gun
could give (`launcher.calibrate`). The planner aims with that efficiency, so a
wrong one lands every shot short or long.

**The record.** At every verdict `LaunchCheck.record` holds a sequence number,
each wheel's speed just before the ball, each wheel's drop (1/10000 of that
speed) and whether a ball went. The board sends it as a `LAUNCH` frame (0x81)
right after every telemetry frame until the next verdict, so a frame lost on
the wire costs nothing; the Pi keys records by sequence number.
`DrillResult.launches` holds the run's records with the shot each belongs to,
and `tennisbots run drill.json --shot-log shots.jsonl` appends them to a file.

**Two things the first version got wrong, both found on the simulator.**

- *The drop has to be taken from the wheel's own speed, not its target.* The
  feed gate opens once a wheel is within 3% of target, and the simulated wheels
  were up to 2.6% off when the ball arrived. Against an 8.8% drop that moved a
  target-based reading by up to 30%. The record now takes each wheel's largest
  fall of one reading below the highest reading of the 2.5 revolutions before
  it, which is the speed the ball met. (The empty-hopper verdict used the
  target at first; it reads this drop now, "The verdict from the pre-ball
  speed" below.)
- *That window has to be in time, not in readings.* While a slowed wheel's next
  pulse is late, `PeriodTach.rpm_last` reports the falling open revolution on
  every 10 ms tick. A history of three distinct readings filled with those and
  lost the pre-ball speed at 1,500 rpm, reading a third of the drop.

**The fit.** `launcher.fit_from_drops` solves the drops for the speed and spin
efficiencies (the model is linear in both) by least squares. The tach's lowest
single revolution shows less than the whole drop, because the speed loop is
already pulling the wheel back during it: on the simulator 78% of it at 1,500
rpm with the fastest loop, 97% at 6,500. The fit models the share as
`((1 - e^-x) / x)^2`, x = one revolution / the loop's recovery time, and fits
the recovery time on a grid when the log spans speeds (fastest wheel at least
1.6 times the slowest). It sets aside wheel readings more than 25% off the fit
once (a wheel still settling when the ball came), and says when every shot was
flat (no spin efficiency) or at one speed (no recovery fit).

`drill.calibration.json` is a 12-shot drill made for it: 16 to 30 m/s, flat,
topspin and backspin, wheels from 2,397 to 6,280 rpm, 4 s apart, and no spin
shot with a wheel under 2,500 rpm ("Spin from fast wheels" below; before
2026-11-16 its wheels went down to 1,062 rpm).

    tennisbots run drill.calibration.json --port /dev/ttyAMA0 --shot-log shots.jsonl
    tennisbots fit-launcher shots.jsonl

It prints the efficiencies and the `"launcher"` block a drill file takes.

**How close (simulated).** `tests/launch_fit_sweep.py` fires the calibration
speeds on the simulated feeder, whose ball leaves with a true launcher model
the planner does not know (speed efficiency 0.70 / 0.85 / 0.95, spin 0.35 /
0.65) and whose wheels lag 0.2 / 0.4 / 0.8 s, with each shot fed 2 s after its
speed is set:

| | worst of 18 builds |
| --- | --- |
| speed efficiency, this fit | 3.9% |
| spin efficiency, this fit | 11.7% |
| speed efficiency, drops read as the whole momentum | 10.9% |

Through the whole Pi path (`run_drill` on `drill.calibration.json`, the Pi's
re-aim timing included) three builds read the speed efficiency 2.3%, 4.4% and
3.7% high and the spin efficiency 7% low, 16% high and 0.5% low
(`tests/test_host.py`, `ShotLogTest`). A radar gun does better on one session;
the drops cost nothing and come with every drill, so they can follow the
efficiency as the wheels' felt wears or a softer batch of balls comes in.

**The wheel's inertia.** Every efficiency the drops give is right only for the
inertia assumed (config.py's `WHEEL_INERTIA_KGM2`, the CAD's figure, not yet
weighed): a wheel 1.3 times heavier reads every efficiency 1.3 times low. One
radar-gun session fixes that for good: `tennisbots fit-launcher shots.jsonl
--radar-speed-eff 0.82` prints the true inertia
(`launcher.inertia_from_radar`; on the simulator a 1.3x wheel came back within
5%), and the drops alone track the efficiency from then on.

**Not measured.** As for the empty-hopper check: first-order simulated wheels,
momentum leaving in one instant, a recovery model fitted to that simulator.
A real ESC may recover in a shape the formula does not follow. The first
build's check is a calibration drill logged beside a radar gun.

## Re-planning a drill from its own shots (2026-11-16)

The shot log measures the launcher's efficiencies, but until now the number
only reached a drill when someone ran `fit-launcher` and pasted its
`"launcher"` block into the file. `tennisbots run --refit-after N` closes the
loop inside the drill:

    tennisbots run drill.rally.json --shot-log shots.jsonl --refit-after 4

After every N shots `host.Refitter` fits this run's drops and re-plans the
shots not yet fed. Only the wheel speeds change (`host.rewheel`): the aim
depends on the ball's speed and spin, which the drill fixes. For each re-plan
it prints the old and new efficiencies and how far each remaining shot would
have landed from its target on the old speeds if the fit is right (the
"landing shift"), and `--shot-log` keeps the records as before.

**Details that mattered on the simulator.**

- *Wait for the last verdict.* A stroke's record lands 250 ms after its
  release, and the runner re-aims straight after the release, so the first
  version re-planned one shot late. With a re-planner the runner now waits for
  the verdict first (half a second of an interval the shot spends waiting
  anyway).
- *The tach's recovery time comes from the calibration drill.* A drill's shots
  sit at a few speeds, too few to fit it (`fit_from_drops`), so `run` reads it
  from the `--shot-log` file when that holds a calibration drill (it is a
  property of the speed loop, not of the felt or the balls), or takes
  `--recovery-s`.
- *Change only what the fit can resolve.* A four-shot fit reads the speed
  efficiency about 3% off. The first version adopted any move over 2%, and on
  builds whose true launcher was the planner's default (0.85) it moved the
  landings from 0.57 m off to 0.90 m off (worst 1.67 m). Each efficiency now
  changes only when the fit moves it beyond its own measured error (5% speed,
  15% spin, from the "Shot log" sweep).
- *Wheels under 500 rpm.* A fitted launcher with a low spin efficiency asked
  for a bottom wheel at 263 rpm, where the simulated wheel never settled and
  the drill timed out; at 400 rpm the empty-hopper check read the ball as no
  ball. The planner now refuses any wheel outside 500..7,000 rpm
  (`host.MIN_WHEEL_RPM`; it used to accept 0), and the re-planner gives such a
  shot its speed with the most spin the wheels can make, re-aimed at the same
  spot, and says so.
- Fits outside 0.3..1.0 (speed) or 0.05..1.0 (spin) are refused, never used.

**How close (simulated).** `tests/refit_sweep.py` runs `drill.rally.json` (16
groundstrokes, 18 to 25 m/s, mostly topspin) on 12 simulated builds whose true
launcher differs from the planner's default (speed efficiency 0.70 / 0.85 /
0.95, spin 0.35 / 0.65, wheel lag 0.2 / 0.8 s), each after one calibration
drill for the recovery time, and flies every ball with the simulator's true
exit speed and spin. Shots 5 to 16, metres from the target
(eval/refit-sweep-2026-11-16.txt):

| | median, worst build | worst shot |
| --- | --- | --- |
| planner's default launcher all drill | 5.16 | 5.21 |
| re-planned after 4 shots, then every 4 | 1.10 | 1.18 |

Every build landed closer re-planned; the two builds the default nearly fitted
went from 0.45 to 0.59 m off to 0.01 to 0.24 m. What is left (up to 1.2 m) is
the fit's own 2-4% speed error from a drill's few speeds; a calibration drill
first, with its `"launcher"` block in the drill file, does better.
(Later the same day the drops were fitted from the pulse times, and the worst
shot came down to 0.74 m: "The drop from the pulse times" below.)

**Not measured.** The simulator's physics, as for the shot log, and
landings computed from its exit speeds, not watched balls.

## The drop from the pulse times (2026-11-16, later)

Both fits above read each wheel's drop from the tach's lowest single
revolution, and that shows only part of it. The ball lands somewhere inside a
revolution, and by the next one the speed loop is already pulling the wheel
back. The fit modelled the missing share with one recovery time,
`((1 - e^-x) / x)^2`, but on the simulator the shape was wrong: the loop sees a
drop late (it reads the 4-revolution mean), so the first revolutions recover
less than the formula says and later ones more. The fitted recovery time and
the speed efficiency traded against each other, and with a drill's few speeds
the speed efficiency came out 3-6% off.

**What changed.** `PeriodTach` now keeps its last 128 revolution periods in a
ring (`ring`, `edges`, `recent`; periods, not times, so the interrupt never
allocates). `LaunchCheck` takes a snapshot of each wheel's periods from the
stroke's start up to the moment the Pi changes the targets, or the verdict,
whichever comes first. For a launched stroke it then fits the ball's whole
drop to them (`controller.drop_from_periods`):

- the wheel turns at w0 (the mean of the three revolutions before the slow
  ones) until the ball, at an unknown moment t0 inside the first slowed
  revolution;
- after t0 it turns at w0 - D and recovers along a parabola (a line when
  only three revolutions are left before the snapshot ends);
- each revolution's mean speed is 1 / its period, so each one integrates that
  curve over its own span. For a fixed t0 this is linear in D and the recovery
  terms. t0 is searched on three nested 9-point grids over the revolution,
  and the t0 with the least residual wins. The fit uses five revolutions from
  the first slowed one.

The record carries the fitted drop and pre-ball speed. Bits 1 and 2 of its
last byte (top and bottom wheel) say a drop is the fitted, whole one. Bit 0 is
still "a ball went", so an older Pi reads the frame as before. The Pi's fit
(`launcher.fit_from_drops`) gives those rows a share of 1 and fits a recovery
time only for rows without the bit, so it can still read old logs. The
empty-hopper verdict is unchanged: it still reads the lowest reading's fall.

**How close (simulated).** `tests/pulse_drop_sweep.py` compares each wheel's
recorded drop with the simulator's true one, over 336 launched wheels (wheel
lag 0.2 / 0.4 / 0.8 s x two true launchers x the rally and calibration drills;
eval/pulse-drop-sweep-2026-11-16.txt). The lowest reading showed 62% to 99.5%
of the drop, 93% on average and 89% under 2,000 rpm. The pulse-time fit shows
100.2% on average, sd 1.5%, range 97.4% to 108.2%, and no speed band is more
than 0.8% off. Five revolutions tested better than four, six or seven. That
choice was tuned on these same simulated wheels.

| `tests/launch_fit_sweep.py`, worst of 18 builds | before | now |
| --- | --- | --- |
| speed efficiency | 3.9% | 1.9% |
| spin efficiency | 11.7% | 6.6% |

Every build now fits with no recovery time at all ("none" in the sweep's
column). The speed efficiency read 0.9-1.9% high on every build; the cause
was the ball's mass, found the same day ("Slow wheels and one ball mass"
below).

`tests/refit_sweep.py`, the drill re-planned from its own shots (12 builds,
shots 5 to 16, metres from the target;
eval/refit-sweep-pulse-drop-2026-11-16.txt):

| | median, worst build | worst shot |
| --- | --- | --- |
| planner's default launcher all drill | 5.16 | 5.21 |
| re-planned, lowest-reading drops (before) | 1.10 | 1.18 |
| re-planned, pulse-time drops (now) | 0.61 | 0.74 |

At the first re-plan, after four shots, the fitted speed efficiency is now
0.9% to 1.8% high on every build. Before, it was 2.9% low to 4.0% high. The
calibration drill's recovery time is no longer needed (`run` still reads it
for old logs).

**Not measured.** The simulator's physics, as before. On top of that, its
tach is exact to the microsecond, and a real hall or IR sensor's jitter will
add noise. The fit runs once per stroke at the verdict, at most 27 small
least-squares solves per wheel; its time on a real ESP32 under MicroPython is
not measured.

## Slow wheels and one ball mass (2026-11-16, later still)

**The 1-2% bias was the ball, not the loop.** The drop fit and `config.py`
assumed a 57.0 g ball (the CAD's `ball_g`); the flight model, and so the
simulator's ball, weighs 57.7 g (`ballistics.DEFAULT_BALL`). The drops measure
momentum, so every drop was 57.7 / 57.0 = 1.0123 of what the fit expected, and
the speed efficiency came out about 1.2% high on every build. Each wheel's
recorded drop divided by the model's prediction at the true efficiencies sat at
1.004-1.015 on a flat shot, the same at every speed: a constant scale, not the
loop's 10 ms steps. Now one mass, 57.7 g (the ITF range is 56.0-59.4 g), sits in
`config.BALL_KG`, `launcher.BALL_KG` and the CAD's `ball_g`, and a test checks
they equal the flight model's ball. On a real machine, weigh a few of your balls:
`fit-launcher --ball-kg` takes the mass, and the fitted efficiencies scale with
it just as they do with the wheel inertia (one radar reading absorbs both).

| `tests/launch_fit_sweep.py`, 18 builds | before | now |
| --- | --- | --- |
| speed efficiency, worst | +1.9% | +0.6% |
| speed efficiency, range | +0.9% to +1.9% | -0.4% to +0.6% |
| spin efficiency, worst | 6.6% | 7.7% |

(eval/launch-fit-sweep-one-ball-2026-11-16.txt.) The spin efficiency is no
better and its worst case is a point worse: its errors are not a scale and
remain the open item.

**Slow wheels are set aside.** With the bias gone, the drill re-plan sweep
showed one bad shot, 1.41 m off target: the re-planned rally drill asked one
build (0.95 / 0.35, 0.2 s lag) for topspin that left the bottom wheel at 520 to
840 rpm. There a revolution takes 70 to 115 ms. At 523 rpm only three
revolutions came after the ball before the verdict, so the firmware fitted a
line and showed 70-78% of the drop. At 836 rpm, the first shot after the wheel
was braked down from 1,522 rpm, it showed 54%. The fit after 12 shots then read
spin efficiency 0.73 for a true 0.35. No wheel under 1,000 rpm was in
`tests/pulse_drop_sweep.py`, which validated the pulse-time drops (its slowest
band is 1,000-2,000 rpm, 100.8% on average). `fit_from_drops` now sets aside
wheel readings under `launcher.MIN_FIT_RPM` (1,000) and says how many in its
note; it refuses a log with none left.

**Refitter's speed tolerance is 2%, down from 5%.** The 5% guarded against a
fit that was 3.9% off; at 0.6% it left builds 2-4% off uncorrected
(`tests/refit_tol_sweep.py`, eval/refit-speed-tol-2026-11-16.txt, median / worst
metres from the target over shots 5 to 16):

| true speed efficiency (plan 0.85) | fixed plan | re-planned, 5% | re-planned, 2% |
| --- | --- | --- | --- |
| 0.88 | 0.97 / 1.00 | 0.97 / 0.98 | 0.01 / 0.02 |
| 0.82 | 0.96 / 1.04 | 0.97 / 1.03 | 0.03 / 0.07 |
| 0.87 | 0.64 / 0.75 | 0.62 / 0.75 | 0.05 / 0.11 |
| 0.85 (right) | 0.00 / 0.01 | 0.00 / 0.02 | 0.00 / 0.02 |

`tests/refit_sweep.py` with all three changes (12 builds, shots 5 to 16;
eval/refit-sweep-one-ball-2026-11-16.txt):

| | median, worst build | worst shot |
| --- | --- | --- |
| re-planned, pulse-time drops (earlier today) | 0.61 | 0.74 |
| re-planned, one ball mass, slow wheels set aside | 0.31 | 0.34 |

**Not measured.** All of it is on the simulator, whose ball and wheels are the
model's own; a real ball's mass, and a real tach's jitter, are not in it. The
1,000 rpm floor and the 2% tolerance were chosen on these same simulated builds.

## Spin from fast wheels (2026-11-16, last)

**Why the spin efficiency was off by up to 8% when the speed efficiency was
within 0.6%.** Two things add up, and neither is the model: each wheel's drop
predicted at the true efficiencies, from the wheels' real speeds at the
release, matches the formula the fit uses term for term, and the wheels sat on
their targets to 0.1%.

- *Leverage.* The speed efficiency comes from the sum of the two drops, but
  the spin efficiency comes from their *difference* on spin shots, and that
  is a small part of each drop. So one wheel's reading error moves the spin
  fit several times as far as it moves the speed fit. At spin efficiency 0.35,
  1.5% noise on each drop gives a 95% band of about +/-9% on the spin
  (a Monte Carlo over the drill's rows). In four of the six worst builds, one
  reading set most of the error: the 1,500 rpm wheel of the 3,500 / 1,500
  topspin shot, which read 3-6.5% high and moved the fit by -4% to -7%.
  The old calibration drill put every spin shot's slow wheel at 1,062 to
  1,961 rpm, where the pulse-time drop is least accurate (sd 1.7% under
  2,000 rpm against 0.5-1.0% above 4,000; `tests/pulse_drop_sweep.py`).
- *A speed-dependent bias.* With a fast wheel loop (0.2 s lag) the pulse-time
  drop reads about 1.5% high at 2,500 rpm and 1.2% low at 5,500, whatever the
  drop's size (flat shots at one speed, true speed efficiency 0.4 to 1.2). On
  a spin shot the slow wheel then reads high and the fast one low, which pulls
  the spin efficiency down: most fits' spin errors were negative. At 0.8 s
  lag there is no trend. A plausible cause is the fit's fixed five
  revolutions: they cover 120 ms of the loop's recovery at 2,500 rpm and 55 ms
  at 5,500, so the parabola meets a different part of the curve.

**What changed.** The calibration drill's spin shots are faster: 24 to 30 m/s
with 1,000 to 2,000 rpm of spin, every wheel at 2,500 rpm or more as planned,
all landing inside the singles court. `fit_from_drops` adds a note when a
log's spin shot has a wheel between 1,000 and 2,000 rpm
(`launcher.SPIN_FIT_RPM`), so someone fitting their own drill knows the spin
figure is soft. A test keeps the drill's spin-shot wheels at 2,400 rpm or more.

**How close (simulated, the whole Pi path).** `tests/spin_drill_sweep.py`
runs both drills through `plan_drill`, `run_drill`, the firmware on
`tests/feeder_sim.py` and `fit_from_drops`
(eval/spin-drill-sweep-2026-11-16.txt, eval/spin-drill-random-40-2026-11-16.txt):

| spin efficiency error | old drill | new drill |
| --- | --- | --- |
| 18 design builds, worst / mean size | 10.6% / 3.2% | 8.1% / 3.1% |
| 12 held-out builds, worst / mean size | 16.6% / 4.8% | 7.8% / 3.7% |
| 40 random builds, worst / mean size | 15.3% / 4.1% | 10.3% / 2.2% |
| 40 random builds, 90th percentile | 9.9% | 5.0% |
| 40 random builds, mean (bias) | -3.8% | -1.9% |

The new drill is closer on 32 of the 40 random builds; the speed efficiency
stays within 0.53% (0.84% before). It is not better on every build: on the
end-to-end test's build (0.78 / 0.42, 0.4 s lag) it reads 8.8% off against
5.8%, so that test's bound is now 10%.

**Tried and set aside** (all on the same simulated builds):

- *Weighting each reading by its expected noise* (sd falling with speed):
  the worst spin error on the old drill went from 7.7% to 5.0-6.2%, but the
  weights were tuned on the builds they were scored on.
- *A fixed time window instead of five revolutions:* at 80 ms the
  fast wheels' bias went from -1.1% to +0.05%, but it moves 1.2% for every
  10 ms of window, so the right window is a property of these simulated
  wheels, not a constant a real build could share.
- *A third fitted parameter for the speed-dependent bias:* five flat shots
  do not pin it down; the worst spin error rose to 23.5%.
- *Reordering the old drill* so no wheel brakes hard before a slow shot: no
  change (7.7% worst), so braking was not the cause.

`tests/launch_fit_sweep.py` keeps the old wheel list and its 2 s dwell as a
stress test. With the new drill's wheel speeds it reads up to 17.7% off at
0.2 s lag, because 2 s is too short for those wheel changes (up to 3,000 rpm
between shots) to settle; at the drill file's 4 s it is 5.4%.

**Open.** The speed-dependent bias is still there (the -1.9% mean). The next
step is a recovery model with the loop's shape in it (the tach's 4-revolution
lag, then the PI's pull) in place of the free parabola, checked on the
captured period snapshots before it goes into the firmware.

**Not measured.** All of it is the simulator's physics and its exact tach; a
real tach's jitter and a real wheel loop's recovery shape are not in it.

## A recovery shaped by the loop's own commands (2026-11-16, later still)

**Why a parabola was the wrong shape.** After a ball the wheel's recovery is
the speed loop's doing: the tach's 4-revolution mean sees the drop late, the
PI then pulls the wheel back, overshoots (the deficit goes 20-30% of the drop
*past* zero) and the integrator lets go. A free parabola over five
revolutions meets a different part of that curve at each speed, and that was
the speed-dependent bias left in "Spin from fast wheels". Simulating the
firmware's own tach and PI on a first-order wheel reproduces the captured
periods closely, but the loop's response hangs on where its 10 ms tick falls
against the ball: across tick phases the fitted drop moved by +/-3% at nearly
the same residual, so a model of the loop fitted to the periods alone cannot
pin it.

**What changed.** The board knows every command it sent, so the fit no longer
guesses the loop. `LaunchCheck` logs each control tick while it watches a
stroke (edge count, microseconds since that edge, the ESC command the tick
set; `TICK_LOG` = 160 ticks), and `controller.drop_from_commands` fits

    w(t) = c + A e^-(t - ts)/tau + W h_tau(t) - D e^-(t - t0)/tau [t > t0]

to each revolution's mean speed (1 / its period): the wheel is a first-order
lag of the commands with one unknown time constant tau, `h_tau` is the logged
commands' response through it, integrated exactly over each revolution, and t0
is the ball. For a given tau and t0 it is linear in c, A, W and D. The free c
lets an ESC whose speed is not proportional to its throttle fit too, and W
need not equal `WHEEL_RPM_FULL`. tau is searched on 0.1-1.6 s
(`LOOP_TAU_GRID_US`, five points a factor of 2 apart) and refined with seven
golden-section evaluations. t0 is searched on three nested 9-point grids over the
*two* revolutions around the slowest one's start: a ball in the last sliver of
a revolution slows it by less than the 0.3% that marks it, and searching only
the later revolution put the fit 1.2-3.6% low on 7 of 560 captured wheels. The
deficits are fractions of the pre-ball speed, so MicroPython's
single-precision floats keep their digits.

It runs as a generator, one t0 grid per control tick (36 steps a wheel, 72 a
stroke), so no tick stalls. The record goes out at the verdict with the
parabola's drops and flags bit 5 set ("loop fit under way"). When the fit is
done the board re-sends it under the same seq with the new drops, bits 3 / 4
set (the top / bottom drop came from it) and bit 5 cleared. `FeederLink`
replaces the record it holds when a frame with the same seq brings new flags,
and `run_drill` waits for it (at most `LOOP_FIT_S`, 2 s) before each re-plan
and at the end of a drill. An older Pi reads the first frame and keeps the
parabola's drops, as before. `drop_from_periods` stays as the fallback when
there is no command log or too few revolutions.

**How close (simulated).** Each wheel's recorded drop over the simulator's
true one, the 336 wheels of `tests/pulse_drop_sweep.py`
(eval/pulse-drop-sweep-loop-2026-11-16.txt):

| | mean | sd | range | worst speed band |
| --- | --- | --- | --- | --- |
| parabola | 1.0004 | 1.34% | 0.974-1.082 | +0.84% (1,000-2,000 rpm) |
| loop commands | 0.9991 | 0.30% | 0.987-1.006 | -0.16% (6,000+ rpm) |

On 224 wheels of four builds the design set never had (true lags 0.25 / 0.3 /
0.6 / 1.0 s, true free speeds 7,500-11,000 rpm while the firmware is told
9,000; `tests/drop_snapshot_capture.py --held-out`): mean 0.9995, sd 0.28%,
range 0.989-1.006; the parabola there read mean 1.0008, sd 1.09%, range
0.974-1.047.

The fit of the launcher from a drill's drops (`launcher.fit_from_drops`), whole
Pi path, both drills on the simulator (eval/spin-drill-sweep-loop-2026-11-16.txt,
eval/spin-drill-random-40-loop-2026-11-16.txt, eval/launch-fit-sweep-loop-2026-11-16.txt):

| spin efficiency error | parabola | loop commands |
| --- | --- | --- |
| calibration drill, 18 design builds, worst / mean size | 8.1% / 3.1% | 1.6% / 0.4% |
| calibration drill, 12 held-out builds, worst / mean size | 7.8% / 3.7% | 1.9% / 0.7% |
| calibration drill, 40 random builds, worst / mean size | 10.3% / 2.2% | 2.1% / 0.8% |
| `launch_fit_sweep.py` stress list (2 s dwell), worst | 7.7% | 1.5% |
| `launch_fit_sweep.py`, speed efficiency worst | 0.6% | 0.2% |

The old drill, whose spin shots put a wheel at 1,062-1,961 rpm, does better
too, but not everywhere: on the 18 design builds its worst spin error is 1.6%
(8.3% with the parabola), yet on the 40 random builds it is still 16.3%,
13.4% and 6.1% on three builds whose wheels lag 0.7 s. Slow wheels on a slow
loop still give too few revolutions before the verdict, so the new drill's
fast spin shots stay.

`tests/refit_sweep.py`, the drill re-planned from its own shots (12 builds,
shots 5 to 16, metres from the target; eval/refit-sweep-loop-2026-11-16.txt):

| | median, worst build | worst shot |
| --- | --- | --- |
| parabola, one ball mass, slow wheels set aside | 0.31 | 0.34 |
| loop commands | 0.07 | 0.40 |

The medians fell on 11 of 12 builds. The worst single shot rose: one shot of
the 0.70 / 0.35, 0.8 s build landed 0.40 m off (0.34 m before), so the re-plan
is not better on every shot.

**Not measured.** The simulator's wheel *is* a first-order lag of its command,
which is exactly the model fitted here, so these numbers are the method's
best case. A real ESC's speed control, a motor's torque limit, belt slip or
a jittery hall sensor will each leave a shape the model does not have, and
the residual would show it before the drop does. The time a fit step takes on
an ESP32 under MicroPython is not measured either (on CPython a wheel's whole
fit takes 4-5 ms, 36 steps). Next: log a real wheel's tach and commands
around a ball and check that the first-order lag fits it; with that, the
1,000 rpm floor (`launcher.MIN_FIT_RPM`) can be retested.

## When the wheel is not a first-order lag (2026-11-16, later still)

**The question.** The loop-command fit above was measured on a simulator whose
wheel is exactly the model it fits, so every number there is a best case. A
real build can break the model: a hall sensor whose edges arrive a few
microseconds early or late, an ESC with a speed loop of its own (a second
lag), a motor that runs out of current, a throttle curve, a slipping belt.
Can the fit tell from its own misses when that has happened?

**What the board now says.** `drop_from_commands` returns two more numbers:
the rms miss per revolution as a share of the pre-ball speed, and the drop's
standard error, s^2 (M^-1)_DD from the fit's own normal equations at the
chosen tau and t0, as a share of the drop. When that standard error is over
`LOOP_SE_MAX` (1%), the record goes out with LAUNCH flags bit 6 (top) or bit 7
(bottom) set, "unsure". The Pi logs them as `unsure_top` / `unsure_bottom`;
`launcher.fit_from_drops` counts them (`DropFit.unsure`) and, when at least
10% of a drill's wheel readings and at least two are marked, its note says the
fit should not be trusted and to check the tach and the ESC's mode. An older Pi
ignores the two bits.

**One wheel at a time** (`tests/loop_residual_sweep.py`, the firmware's own
PeriodTach and WheelLoop on 24 cases per plant: 1,500-6,000 rpm, 6% and 10%
drops, lags 0.2-0.8 s, the ball at varied tick phases;
eval/loop-residual-sweep-2026-11-16.txt):

| plant | fit error, mean / worst | marked |
| --- | --- | --- |
| first-order (the model) | 0.21% / 0.72% | 0 of 24 |
| torque limit 20,000 / 8,000 / 3,000 rpm/s | 0.20-0.31% / 1.20% | 1 of 72 |
| throttle curve (cmd^1.25) | 0.25% / 0.89% | 0 of 24 |
| tach jitter 5 us | 0.74% / 2.27% | 11 of 24 |
| tach jitter 20 / 50 us | 6.7% / 48% and 10.6% / 53% | all 41 fitted |
| ESC lag 30 / 80 ms | 2.8% / 8.5% and 3.3% / 16.3% | 21 of 48 |
| belt slip (magnet shaft 3x the ball's drop) | 106% / 141% | all 20 fitted |

Of the 72 drops more than 2% off, 67 were marked; of the 152 within 1%, 14
were. A current limit and a throttle curve do not matter (the free constant
absorbs the curve; the drops are too small to hit the limit). The tach's
timing and the ESC's own lag do.

**A whole drill** (`tests/plant_drill_sweep.py`, the calibration drill through
the whole Pi path on the 18 design builds; eval/plant-drill-sweep-2026-11-16.txt):

| plant | spin efficiency error, worst / mean | wheels marked (fewest-most a drill) | drills warned | marked drops set aside instead: spin worst / mean |
| --- | --- | --- | --- | --- |
| first-order (the model) | 1.6% / 0.4% | 0 of 432 (0-0) | 0 of 18 | 1.6% / 0.4% |
| tach jitter 5 us | 5.3% / 2.0% | 180 of 432 (5-17) | 18 of 18 | 7.2% / 2.7% |
| tach jitter 10 us | 16.0% / 5.4% | 341 of 432 (15-22) | 18 of 18 | 89% / 23% |
| tach jitter 20 us | 22.1% / 8.4% | 416 of 432 (20-24) | 18 of 18 | 13 drills left nothing to fit |
| ESC lag 30 ms | 23.8% / 5.5% | 149 of 432 (0-23) | 9 of 18 | 100% / 12.5%, 2 drills nothing to fit |
| ESC lag 80 ms | 19.9% / 6.6% | 129 of 432 (0-18) | 12 of 18 | 12.2% / 3.8% |

Speed efficiency stayed within 1.8% on the jitter plants and 4.2% on the ESC
plants. The jitter is caught in every drill. The ESC lag is not: some drills
marked none of their wheels and still read the spin badly, so the warning
fired on 9 and 12 of 18 drills. The standard error sees noise well and a
smooth shape the model lacks less well, since a second lag can be partly
absorbed by a longer tau.

So the marks are a detector, not a filter. Setting the marked drops aside was
the first policy tried, and it did not help: with 5 us of jitter it made the
spin error worse (5.3% to 7.2% worst), because a noisy drop is still an
unbiased one and removing it only loses data. At 10-20 us and with a 30 ms ESC
lag so many wheels were marked that little or nothing was left. It helped on
one plant only (80 ms ESC lag, 19.9% to 12.2%). The Pi warns; it fits with
every drop.

**The tach interrupt is now hard.** `main.py`'s `Tach` registered a soft
interrupt, so `ticks_us()` was read when the main loop next yielded, up to a
control tick's work after the edge. With the numbers above that is the worst
place for timing error to come from, so the handler now runs as a hard
interrupt (`hard=True`; `_p` and `PeriodTach.edge` allocate nothing) with an
emergency exception buffer. The simulator calls the handler at the true edge
time either way, so this change is not measured here; a hard interrupt's own
latency on an ESP32 under MicroPython is still tens of microseconds at worst,
so the board's timing remains the first thing to measure on a real wheel.

**Next.** Fit the drop on the edge times rather than on periods: the jitter
is on each time, so neighbouring periods share it with opposite signs, and the
period fit treats them as independent. Add an ESC lag (a second, fixed time
constant searched like tau) to the model for ESCs that run their own speed
loop. Time a real wheel's edges against a scope to get the real jitter, then
rerun these sweeps with it. Physics and plants here are assumptions, not
measurements.

## An ESC lag picked from the build's own balls (2026-11-16, last)

**The item.** The section above ends by asking for an ESC lag in the model,
because a second lag between the command and the wheel is what its standard
error saw least well: on the calibration drill a 30 ms ESC lag left the spin
efficiency 23.8% off at worst, an 80 ms one 19.9%, and some of those drills
marked no wheel at all.

**How.** `controller.esc_lagged_ticks` passes the logged commands through a
lag of `ESC_TAU_US` (1 ms steps), and the same loop-command fit then fits the
wheel's own lag on top of that drive. `config.ESC_TAU_US` (default 0, the fit
as before) sets it on the board; `LaunchCheck` applies it to both wheels.

**Picking the lag.** One ball cannot reliably tell the two lags apart.
Picking a lag per ball by least residual removed the bias, but it widened
the spread on first-order builds (sd 0.30% to 0.53%, worst 1.057, measured
offline on 336 snapshots per kind). The lag is a property of the build, not
of the ball, so `tests/esc_lag_pick.py` sums each wheel's squared residual
rms over two drills (rally and calibration, two true launchers) for each lag
on 0 / 20 / 50 / 100 / 200 / 400 ms and takes the least. It then reruns the
drills with the board set to that lag and compares each record's drop with
the simulator's true one (eval/esc-lag-pick-2026-11-16.txt):

| build (wheel lags 0.2 / 0.4 / 0.8 s) | picked | drop / true, ESC_TAU_US 0: mean, worst | with the pick: mean, worst |
| --- | --- | --- | --- |
| first-order | 0, 0, 0 | 0.998-1.000, 0.987 | unchanged |
| ESC lag 30 ms | 20, 20, 20 | 0.956-0.987, 0.904 | 0.990-0.997, 0.973 |
| ESC lag 40 ms | 50, 50, 50 | 0.954-0.987, 0.894 | 1.001-1.006, 1.025 |
| ESC lag 80 ms | 100, 100, 100 | 0.956-0.987, 0.874 | 1.000-1.001, 1.018 |
| ESC lag 100 ms | 100, 100, 100 | 0.958-0.987, 0.880 | 0.999-1.000, 0.991 |
| ESC lag 100 ms, jitter 3 us | 100, 100, 50 | 0.958-0.984, 0.525 | 0.993-1.000, 0.571 |

**The whole drill.** `tests/plant_drill_sweep.py --esc-tau-us N` runs the
section above's calibration drill with the board set to N
(eval/plant-drill-esc-tau-2026-11-16.txt). Spin efficiency error, worst /
mean, on the 18 design builds:

| plant | ESC_TAU_US 0 | the picker's value | the true lag |
| --- | --- | --- | --- |
| ESC lag 30 ms | 23.8% / 5.5% | 6.5% / 1.6% (20 ms) | 1.4% / 0.5% |
| ESC lag 80 ms | 19.9% / 6.6% | 3.0% / 1.0% (100 ms) | 1.8% / 0.7% |
| first-order | 1.6% / 0.4% | 1.6% / 0.4% (0) | - |
| first-order, set wrongly to 20 / 50 ms | - | 41.2% / 9.2%, 44.1% / 10.1% | - |

Speed efficiency came within 1.1% with any ESC setting near the true lag.
With the right lag, no wheel was marked unsure. A wrong setting is much worse
than none: a first-order build told 20 or 50 ms reads the spin 41-44% off.
That case does show, though, because 144 and 205 of its 432 wheels were
marked unsure and 6 and 12 of 18 drills warned. So the setting must come from
the build's own balls and not from a guess. On the simulator the picker
chose 0 for every first-order build. The grid's spacing is now the limit:
30 ms read 6.5% at the picker's 20 ms against 1.4% at the true 30 ms.

**Not done.** On a real build the pick needs each ball's period snapshot and
tick log, and the board does not send them to the Pi, so `ESC_TAU_US` can
only be set by hand for now. The drive samples make the fit's segments about
ten times as many, and the cost on an ESP32 is not measured. Next: sum the
grid's residuals on the board across a drill and report the least (or send
the snapshots in the shot log), with a finer grid near the winner. Then log a
real ESC's step response and see which shape it has.

## The ESC lag surveyed on the board (2026-11-16, last of the day)

**The item.** The section above picked `ESC_TAU_US` from snapshots the board
never sends, so on a real build it could only be guessed, and a wrong guess
is worse than none. Now the board picks it.

**How.** After each launched stroke's record is out (its own fit is always
finished first), `LaunchCheck` refits each turning wheel's snapshot at the six
lags of `ESC_SURVEY_GRID_US` (0 / 20 / 50 / 100 / 200 / 400 ms), one step a
control tick, and adds each lag's squared residual rms to a running sum,
counting a wheel only when every lag fitted it (the same rule as
`tests/esc_lag_pick.py`). The survey fits without the tau golden-section
refinement (15 steps a lag, not 36): on 112 simulated wheels per plant it
picked the same lag as the refined fit on an 11-point grid for every plant.
A new stroke cuts a survey short (`survey_cut`) rather than finishing it in one
tick. `controller.survey_pick` then refines the least grid point with a
parabola through it and its neighbours (in the lag's log, or in the lag when
the lower neighbour is 0). The new ESC_SURVEY frame (0x82) carries the wheel
count, the grid pick, the refined pick and each lag's mean rms;
`host.run_drill` waits up to 4 s at a drill's end for the last ball's survey
and keeps it in `DrillResult.esc_survey`, and `tennisbots run` prints one
line: keep 0, run more balls (under 16 wheels), or "set ESC_TAU_US = N".
`config.ESC_SURVEY_GRID_US = ()` turns it off.

**How close (simulated).** `tests/esc_survey_sweep.py --all` runs the rally
and calibration drills on one board (54 wheels), then the calibration drill on
a fresh board set to the refined pick, over wheel lags 0.2 / 0.4 / 0.8 s and two
true launchers (eval/esc-survey-sweep-2026-11-16.txt). No survey was cut.

| plant | refined pick, ms | calibration spin error, ESC_TAU_US 0: worst / mean | with the pick | speed worst, 0 / pick |
| --- | --- | --- | --- | --- |
| first-order | 0 (all 6) | 0.5% / 0.1% | unchanged | 0.2% / 0.2% |
| ESC lag 30 ms | 27-28 | 15.8% / 4.4% | 0.6% / 0.4% | 4.1% / 0.3% |
| ESC lag 60 ms | 54-57 | 13.3% / 6.1% | 0.8% / 0.7% | 3.7% / 0.2% |
| ESC lag 80 ms | 75-79 | 17.7% / 6.7% | 0.8% / 0.6% | 3.6% / 0.1% |
| ESC lag 150 ms | 137-141 | 14.9% / 6.9% | 1.0% / 0.5% | 2.7% / 0.3% |
| ESC lag 100 ms, 3 us jitter | 101-107, and 0 once | 15.7% / 6.3% | 4.8% / 2.0% | 3.3% / 1.1% |

The parabola closes the grid's gap from the section above (30 ms read at 20
gave 6.5%; now 0.6%). One build missed: the jittery 100 ms ESC at a 0.8 s
wheel lag picked 0, so it stayed at 2.4% spin error; at a slow wheel the ESC's
lag is a small share of the recovery and 3 us of jitter hides it.

**Not measured.** Everything is the simulator's physics and plants. The
survey is six more fits per wheel after every ball, about 180 control ticks
(1.8 s) for a two-wheel shot here; its time under MicroPython on an ESP32 is
not measured, and a drill that feeds faster than that will cut surveys (the
count says so). Next: time a fit on a real board, and log a real ESC's step
response to see whether a second first-order lag is its shape at all.

## The drop on the edge times: tried, kept off (2026-11-16, last of the day)

The section "When the wheel is not a first-order lag" asked to fit the drop on
the edge times, since a tach's jitter moves each edge once and neighbouring
periods share it with opposite signs. `drop_from_commands(..., edges=True)`
does that: each row is an edge's running angle lag (the running sum of the
revolutions' deficits times their spans) with a free offset for the window's
first edge, so each row carries one independent error. For a linear fit that
is the best weighting. It did not help here. `tests/edge_form_sweep.py`
(24 single wheels x 8 jitter draws, compared on the cases both forms fit;
eval/edge-form-sweep-2026-11-16.txt), the drop's spread:

| jitter | periods | edges |
| --- | --- | --- |
| 0 | 0.28% | 0.26% |
| 3 us | 0.57% | 0.68% |
| 5 us | 0.86% | 1.03% |
| 10 us | 2.85% | 3.25% |
| 20 us | 5.26% | 5.59% |

The edge form also gave no fit on a few more cases at 10-20 us (3 and 14 of 192
against 1 and 9). The likely cause is the nonlinear part: t0 and tau are chosen
by least residual, and the edge form's residual ranks them differently. The
option stays, off by default, for anyone who wants to try it with a real tach's
edges.

**The whole drill, and why (a second session, same day).** The single-wheel
spread above could still have hidden a gain where it counts: the drill's
fitted spin. `tests/edge_fit_drill.py` runs the calibration drill's whole Pi
path on the 18 design builds x 3 seeds, with the board's fit swapped for the
edge form (`--edges`; eval/edge-fit-drill-2026-11-16.txt). Spin efficiency
error over 54 drills, rms / worst / bias, %:

| plant | periods | edges |
| --- | --- | --- |
| first-order | 0.62 / 1.62 / -0.16 | 0.58 / 1.22 / -0.03 |
| tach jitter 5 us | 2.20 / 5.31 / +0.53 | 2.97 / 11.50 / -0.31 |
| tach jitter 10 us | 6.55 / 22.89 / -0.94 | 9.07 / 30.01 / -3.39 |
| ESC lag 80 ms | 8.67 / 19.87 / +6.55 | 9.06 / 22.39 / +6.59 |

So the drill loses too. Checks on the cause (scratch scripts, not committed):

- The noise model is right: added edge noise gives the period rows' misses a
  lag-1 correlation of -0.498 (the model's -0.5).
- The gain is small even in theory. In a linear toy (13 rows: a constant, a
  decaying term and a step, noise differenced from iid edge errors) the step's
  error is 1.29 on the running sums against 1.35 on the rows, 4%. A step is a
  high-frequency feature, where differenced noise is strongest anyway.
- With the wheel's lag fixed at its true value and the edge errors added after
  the run (so the loop never saw them), the sums still read worse (median 1.37%
  against 0.86% at 10 us). That leaves t0, as the paragraph above suspects.
- Weighting each revolution by its own span before summing (as the shipped
  option does) puts the edge errors into the constant column too; summing the
  rows unweighted measured the same, so that is not the cause.

On single wheels the edge form does remove the period fit's rare wild
readings (a wrong t0 at 5,000-6,000 rpm: worst 63% to 5% at 10 us over 144
balls, measured with the unweighted variant), but the launcher fit already trims wild rows, so the typical error is
what reaches the drill. If a real tach shows 10 us or more, the thing to try
is t0 chosen on the sums and the drop estimated on the rows at that t0.

## One wheel's misses outvoted the drill (2026-11-16, after the survey)

**The item.** The survey above missed one build: the jittery 100 ms ESC at a
0.8 s wheel lag picked 0 and stayed at 2.4% spin error. Why?

**The cause.** `tests/esc_survey_weight.py` keeps every surveyed wheel's
squared residual at each grid lag (`--dump`), so the summing rule can be
changed without rerunning the simulator. In that build, one wheel of 56
(5,479 rpm) missed by 7,650 ppm of its speed at its best lag, against 120 to
830 for every other wheel. Its square was larger than all the others put
together, and it fitted 0 slightly better (by 5%). A plain sum of squares
gives the worst-fitted wheel the most weight, so that one wheel set the pick.
It is not a trend with speed: wheels at 4,500-6,300 rpm fitted as well as the
slow ones.

**Rules tried** (refined pick within 10% of the true lag; 102 builds, the 9
plants at wheel lags 0.2 / 0.4 / 0.8 s, two true launchers, the jittery plants
on seeds 7 / 8 / 9; eval/esc-survey-weight-2026-11-16.txt):

| rule | within 10% | ESC builds that picked 0 |
| --- | --- | --- |
| sum of rms^2 (the board until now) | 93 | 5 |
| sum of log(rms^2), each wheel its own noise | 90 | 0 |
| sum of rms^2 / the wheel's own least | 98 | 0 |
| sum of rms^2 without wheels over 3 / 5 / 10 x the median wheel's best rms | 101 / 100 / 100 | 0 |

The log is the textbook answer (one noise level per wheel), and it did fix
every jittery build, but it pulled the clean plants off: 60 ms read 48-50 and
150 ms read 119-136. The likely reason is that on a noise-free wheel the tiny
model misses then get a full vote. Trimming only the outliers keeps the plain
sum's precision. The factor hardly matters (3, 5 and 10 differ by one build).

**On the board.** `LaunchCheck` now keeps each surveyed wheel's six squared
residuals (`survey_wheels`, the last `SURVEY_KEEP` = 128, 24 bytes each) and,
when it reports, sums them without the wheels whose best rms is over
`SURVEY_TRIM` (5) times the median wheel's. `survey_trimmed` counts those
left out. The ESC_SURVEY frame is unchanged; its wheel count is still every
surveyed wheel, and its per-lag rms is over the wheels kept.

**Held out** (seeds 10 / 11 / 12 on the four jittery plants, run after the
factor was set; 72 builds): trim 5 had 70 within 10% and no zero picks; the plain
sum had 67, with 4 builds at 0. The two trim misses read 90 and 111 ms for 100
(5 us of jitter). End to end through the board and the Pi, the build that
failed now picks 99 ms (one wheel trimmed), and the calibration fit's spin
error falls from +2.4% to +0.8% (speed -1.1% to -0.2%).

**Not known.** The outlier's own fit is the open question: why one wheel in
56 misses 10 to 60 times more than the rest. The likely answer is a jitter
draw landing where the ball meets the wheel, but this run did not check that.
Physics and plants are the simulator's assumptions. The heap cost of 128 kept
wheels (about 3 KB as float arrays) and the report's sort are counted, not
measured on an ESP32.

## The 1,000 rpm floor retested (2026-11-16, after the trim)

**The item.** `launcher.fit_from_drops` sets aside every wheel under
`MIN_FIT_RPM` (1,000 rpm). The floor was chosen when the record's drop came from
the pulse-time parabola, which showed only 70-78% of a 523 rpm wheel's drop.
The drop now comes from the loop-command fit, which models the recovery
instead of reading it off a few revolutions. Is the floor still needed, and
where should it sit? No drill in the sweeps that validated the loop fit put a
wheel under 1,000 rpm.

**The sweep.** `tests/min_fit_rpm_sweep.py` builds a slow-wheel drill: heavy
topspin and backspin shots whose slow wheel is planned at 520-1,500 rpm (the
planner refuses under 500). Each shot comes twice, once straight after a fast
flat shot and once after itself. It runs on the simulated feeder with three
plants (the first-order model, 5 us tach jitter, a 30 ms ESC lag), wheel lags
of 0.2 / 0.4 / 0.8 s and three true launchers. Part 1 compares each wheel's
record drop with the simulator's true drop. Part 2 fits the launcher from the
calibration drill's log plus the slow drill's at several floors
(eval/min-fit-rpm-retest-2026-11-16.txt).

**What it found first: the Pi cut the slow wheels short.** Under 1,000 rpm,
most bad readings were records where the loop fit never ran and the drop fell
back to the parabola. The board freezes a stroke's pulse snapshot when the
wheel targets change, because the pulses after that are the next shot's speed
change, not the ball. `run_drill` sent the next shot's speeds as soon as the
release was counted. At 5,000 rpm that still leaves plenty of revolutions. At
550 rpm it left one or two after the ball, and the loop fit needs three. The
same shot followed by an identical one (no target change) kept its
revolutions up to the verdict and read within 1%.

**The change.** After a shot with a turning wheel under `host.HOLD_RPM`
(1,000), the Pi waits for the verdict (`VERDICT_S` after the release, about
0.3 s) before sending the next shot's speeds. A re-planned drill already
waited there. Record drop / true drop, 750-1,000 rpm wheels (54 per plant):

| plant | before: >2% off, range | with the hold: >2% off, range |
| --- | --- | --- |
| first-order | 16, 0.695-1.531 | 0, 0.989-1.010 |
| tach 5 us | 19, 0.838-1.085 | 0, 0.990-1.007 |
| ESC 30 ms | 18 of 36, 0.705-1.046 | 14 of 36, 0.971-0.997 |

The ESC plant's remaining misses are its bias at every speed (2,500 rpm and
up: 0.954-1.002), not a slow-wheel effect. At the current floor the fit
improves too (spin efficiency error, mean / worst over the builds):

| plant | before | with the hold |
| --- | --- | --- |
| first-order (9 builds) | 0.69% / 2.39% | 0.27% / 0.52% |
| tach 5 us (9) | 2.58% / 8.11% | 1.42% / 4.16% |
| ESC 30 ms (6) | 1.16% / 2.00% | 0.97% / 2.15% |

It costs little: the 30-shot slow drill took 124.9 s against 125.5 s at a
0.2 s wheel lag, and 136.2 s against 133.0 s at 0.8 s. The big speed changes
already stretch the 3 s interval.

**The floor stays at 1,000 rpm.** With the hold, 500-750 rpm wheels still
read 0.68-1.13 of their drop: the loop fit gave up on 17 and 19 of 54 (20
of 36 behind the ESC lag), and some it did fit were up to 12% off. Floors of 0 or 500 put the spin error at 31-43%
worst. A 750 floor was not better across the plants (spin worst 0.72 / 3.18 /
2.29% against 0.52 / 4.16 / 2.15% at 1,000), and counting slow wheels only
when the loop fit made their drop changed nothing at 750. Picking 750 from these
same builds would be fitting noise.

**Also seen.** On the ESC 30 ms plant with a 0.2 s wheel lag, all three
builds aborted at the first slow shot: the speed loop never held a ~510 rpm
wheel inside the ready gate within 10 s. Slow wheels behind a laggy ESC may
need their own loop gains. This run did not look into it.

**Not measured.** All of it is on the simulator. The hold's threshold and the
floor were judged on these same builds, and no real wheel has run below
1,000 rpm.

## The outlier wheel was anchored past its ball (2026-11-16, after the trim)

**The item.** "One wheel's misses outvoted the drill" left open why one surveyed wheel in about 56 misses the
loop-command fit by 10 to 60 times more than the rest, and guessed at a jitter draw near the ball.

**The cause.** It is where the fit looks for the ball. `drop_from_commands_steps` anchors on the longest period in the
snapshot, k, and searches the ball's time only from the start of k - 1 to the end of k + 1. Behind a slow recovery
(a 40-100 ms ESC lag on a 0.4-0.8 s wheel) the revolutions after the ball are nearly level: at 5,479 rpm the first
two after it were 11,475 and 11,489 us. Tach jitter (period noise about 7 us at 5 us an edge) decides which is longer. When the
second one wins, k is two revolutions past the ball, the ball is outside the search, and the fit has to bend every
other term to explain a drop that came too early. `tests/survey_outlier_cause.py` records each wheel's true ball
revolution from the simulator and compares it with k. On the four jittery plants, wheel lags 0.2 / 0.4 / 0.8 s, both
true launchers and seeds 7-12 (144 builds, 8,064 wheels):

| | wheels over 5 x the median rms | of them, k two past the ball | other wheels with k two past |
| --- | --- | --- | --- |
| before | 21 | 21 | 6 |
| with the walk back | 0 | 0 | 0 |

Every outlier was this, and nothing else was an outlier. The jitter was a cause only through the anchor.

**The change.** `controller._anchor`: k steps back (at most twice) while the period before it already holds over
`ANCHOR_BACK` (0.9) of k's rise above the periods before the ball (their median, leaving out the two just before k).
A ball partway through its revolution leaves that revolution well under 0.9 of the rise, so the usual anchor (the
first full revolution after the ball) stays. 0.9 was set on the one build that first failed (seed 7); the rest ran
after it.

**What it does to the survey** (`tests/esc_survey_weight.py`, refined pick within 10% of the true lag):

| builds | plain sum before | trim 5 before | plain sum now | trim 5 now |
| --- | --- | --- | --- | --- |
| seeds 7-9, all plants (102) | 93, 5 ESC builds at 0 | 100 | 102 | 102 |
| seeds 10-12, jitter plants (72) | 67, 4 at 0 | 70 | 70 | 70 |

The plain sum no longer needs the trim: no wheel crosses `SURVEY_TRIM` on these builds. The trim stays as a guard for
shapes the simulator does not have (a real tach's dropout, a bump).

**What it does to the drill** (`tests/plant_drill_sweep.py --back 0` against the default; calibration drill, 18
builds; launcher fit's speed / spin efficiency error, worst and mean spin):

| plant | before | now |
| --- | --- | --- |
| first-order | 0.2%, 1.6% / 0.4% | 0.2%, 1.6% / 0.5% |
| tach 5 us | 0.5%, 5.3% / 2.0% | 0.4%, 5.3% / 2.0% |
| tach 10 us | 1.1%, 16.0% / 5.4% | 1.0%, 7.2% / 3.2% |
| tach 20 us | 1.8%, 22.1% / 8.4% | 2.3%, 15.8% / 5.6% |
| ESC 30 ms, board lag 0 | 4.2%, 23.8% / 5.5% | 4.2%, 23.6% / 5.5% |
| ESC 80 ms, board lag 0 | 3.6%, 19.9% / 6.6% | 3.7%, 23.4% / 6.8% |
| ESC 30 ms, board lag 30 ms | 0.1%, 1.4% / 0.5% | 0.1%, 1.7% / 0.4% |
| ESC 80 ms, board lag 80 ms | 0.2%, 1.8% / 0.7% | 0.2%, 1.2% / 0.6% |

The jittery tachs gain the most (10 us: worst spin 16% to 7%). On an ESC lag the board does not model, one build's
spin got worse (19.9% to 23.4% worst, mean 6.6% to 6.8%); with the lag set, as the survey advises, both forms read
within 2%. The 5 us row is unchanged because its remaining error is the jitter on every revolution, not the anchor.

**Not known.** All of it is on the simulator. A real tach's noise may not be Gaussian, and a real ball's contact may
spread over more than one revolution; both would change where the level run starts. Raw output:
eval/survey-outlier-anchor-2026-11-16.txt.

## Slow wheels need slower gains (2026-11-16, after the anchor)

**The item.** "The 1,000 rpm floor retested" saw every build on a 30 ms ESC lag with a 0.2 s wheel abort at its
first slow shot: the speed loop never held a ~510 rpm wheel inside the ready gate in 10 s. Why, and what fixes it?

**The cause: the tachometer's delay grows as the wheel slows, and the gains did not.** `PeriodTach` reads the mean of
the last four revolutions, and its reading changes once a revolution, so it trails the wheel by about 2.5
revolutions: 43 ms at 3,500 rpm, 0.29 s at 510 rpm. `WheelLoop`'s gains were fixed, set on wheels at 1,500-6,500 rpm.
On the simulator the 510 rpm wheel swung 460-564 rpm for ever. A linear model of the loop (PI, the wheel's lag, the
ESC's lag, that delay; `tests/low_speed_loop_sweep.py --margins`) gives the phase margin:

| ESC lag, wheel lag | 510 rpm | 750 | 1,000 | 1,500 | 3,500 |
| --- | --- | --- | --- | --- | --- |
| none, 0.2 s | -39 | 5 | 29 | 52 | 79 |
| 30 ms, 0.2 s | **-48** | -5 | 18 | 41 | 66 |
| 30 ms, 0.4 s | -3 | 23 | 36 | 49 | 65 |
| 80 ms, 0.2 s | -46 | -8 | 12 | 31 | 54 |
| same, gains scaled under 1,500 rpm (30 ms, 0.2 s) | 63 | 59 | 53 | 41 | 66 |

A negative margin rings for ever; the first-order plant at 0.4 s and above sits just over zero, which is why only the
fast-wheel, laggy-ESC builds aborted.

**A second fault the sweep found: the gate passed slow wheels off their speed.** `SteadyGate` wants 150 ms inside
3%. At 510 rpm that is one or two tach readings of a four-revolution average, so a wheel still closing on its target
could pass while 13% off its true speed.

**The change.** `controller.LOOP_LOW_RPM` (1,500): under it, `WheelLoop` scales both gains by target / 1,500, which
holds the crossover a fixed share of the delay. `controller.GATE_HOLD_REVS` (6): the gate's hold is at least six
revolutions of the slowest turning wheel (0.71 s at 510 rpm; 150 ms still governs from 2,400 rpm up).
`tests/low_speed_loop_sweep.py` sets one wheel at 510-2,000 rpm and the other at 3,500, from rest and from 5,000 rpm
on both, on four plants (first-order, 5 us tach jitter, 30 and 80 ms ESC lag), wheel lags 0.2 / 0.4 / 0.8 s and free
speeds 7,000 and 11,000 rpm while the firmware is told 9,000: 336 cases. The true error is the worse wheel's when the
gate first passes, which is when a ball would go:

| firmware | never steady in 12 s | passed over 3% off | worst at the gate | median time to steady |
| --- | --- | --- | --- | --- |
| before | 20 | 165 | 12.8% | 3.59 s |
| scaled gains only | 0 | 100 | 9.9% | 3.55 s |
| 4-revolution hold only | 26 | 54 | 6.6% | 3.70 s |
| scaled gains, 4 revolutions | 0 | 40 | 6.3% | 3.61 s |
| scaled gains, 6 revolutions (now) | 0 | 14 | 7.0% | 3.76 s |

The longer hold alone makes the never-steady count worse (a ringing wheel rarely stays inside for longer); the
scaled gains alone settle every case but still let balls go off speed. Both together do what neither does. Of the
14 left over 3%, five are at 1,250-2,000 rpm, where neither change acts much; that remainder is the gate's
tolerance against a tach that trails the wheel at every speed, not a slow-wheel effect. `tests/wheel_loop_sweep.py`
(the drill's wheel pairs, 36 cases) still has every case steady, slowest 5.03 s as before, worst error at the gate
2.6% (4.1% before; its old note said 2.8%, measured before the spin-up ramp).

**The drill that aborted.** The ESC 30 ms plant of `tests/min_fit_rpm_sweep.py` (slow drill, `HOLD_RPM`
1,000) now finishes all nine builds; the three 0.2 s builds aborted before. Those three read the launcher at 3.8% speed
and 0.9% spin error (mean, floor 1,000). On the six builds that ran before (0.4 / 0.8 s), against
eval/min-fit-rpm-retest-2026-11-16.txt, record drop / true drop:

| band | before: >2% off, range | now: >2% off, range |
| --- | --- | --- |
| 500-750 rpm | 25 of 36, 0.683-1.178 | 18 of 36, 0.748-1.280 |
| 750-1,000 | 14 of 36, 0.971-0.997 | 2 of 36, 0.970-1.008 |
| 1,000-1,500 | 17 of 36, 0.954-1.030 | 17 of 36, 0.958-1.480 |
| 2,500 and up | 33 of 240, 0.954-1.002 | 38 of 240, 0.952-1.002 |

The launcher fit at the 1,000 floor got worse on these six: spin error mean / worst 0.97 / 2.15% before, 1.72 /
6.65% now (speed 1.66 / 2.24% to 1.59 / 2.24%). It is one wheel: a 1,107 rpm bottom wheel on build 0.7/0.35 at
0.4 s read 1.48 of its drop through the loop-command fit. On that build the old firmware had four wheels over 5% off
(512-584 rpm), scaled gains alone none, the 6-revolution hold alone three and both two. So the outlier is one fit
missing on one ball's timing, not a systematic bias, but it is not explained. Raw output:
eval/low-speed-loop-drill-2026-11-16.txt.

**How the numbers were picked.** 1,500 came from the margin model (at 1,000 the worst plant keeps only 12-18
degrees) and agreed with a grid of 1,000 / 1,500 knees and 3 / 4 / 6 revolutions
(eval/low-speed-loop-grid-2026-11-16.txt; the 1,000 knee let one 600 rpm case go 13.9% off). Six revolutions was
the best of the three on these same cases, so it is fitted to them. Raw output:
eval/low-speed-loop-gains-2026-11-16.txt, eval/low-speed-loop-margins-2026-11-16.txt.

**Not known.** All of it is on the simulator with its first-order wheel; a real ESC's own speed control, a real
tach's dropouts and the four-period average are the assumptions the margin rests on. A slow shot now waits up to
0.7 s longer for the gate. A tach that averaged a fixed time rather than four revolutions would shrink the delay
itself; not tried.

## The 1.48x wheel (2026-11-16, later)

**The item.** "Slow wheels need slower gains" left one wheel unexplained: on build 0.7/0.35 at a 0.4 s wheel lag
behind a 30 ms ESC, a 1,107 rpm bottom wheel read 1.48 of its true drop through the loop-command fit.

**The cause: the snapshot ended three revolutions after the ball.** Rerun alone, the wheel (shot 20 of the slow
drill) reproduced: true drop 0.170, record 0.2515. Its snapshot held 14 revolutions before the ball and three after.
`LaunchCheck` freezes the snapshot when the wheel targets change, and the Pi sends the next shot's speeds as soon as
it sees the release, unless a wheel is under `host.HOLD_RPM`, then 1,000. At 1,107 rpm the wheel was not held, so the
snapshot stopped about 0.16 s after the ball. On three recovery revolutions the fit put the wheel's time constant at
the bottom of its grid (0.1 s; the true lag is 0.4 s) and the drop 48% high. Another 1,106 rpm wheel in the same
drill had six revolutions after its ball and read 0.1671. Of the drill's 60 loop fits, the ten with three or four
revolutions after the ball were the unheld wheels at 1,107-1,509 rpm and held wheels under 1,000 rpm, which the
verdict 250 ms after the stroke limits instead.

**The change.** `host.HOLD_RPM` is 3,000: after a shot with a turning wheel under it, the next speeds wait for the
verdict (0.5 s after the release). 3,000 rpm turns the fit's eight revolutions in the 0.16 s an unheld wheel gets. On
the two builds tried first, 1,500, 2,000 and 3,000 gave identical results (eval/hold-rpm-sweep-2026-11-16.txt); 3,000
is the one with a reason behind it.

**The board must know its ESC's lag for this to pay.** On the 30 ms ESC plant with the board told no ESC lag (as in
`tests/min_fit_rpm_sweep.py`), holding more wheels removed the outlier but the launcher fit got worse (all nine
builds, floor 1,000: spin error mean / worst 1.46 / 6.65% to 2.10 / 8.12%). The held wheels' longer recoveries carry
more of the untold lag's bias (the 1,000-1,500 band went from 0.984 to 0.963 of the true drop). Told the lag
(`LaunchCheck.esc_tau_us` 30 ms, what `ESC_TAU_US` holds after the board's survey, "The ESC lag surveyed on the
board"), record drop / true drop at a 0.4 s wheel lag, three builds:

| HOLD_RPM | 1,000-1,500 rpm: mean, sd, max, >2% off | 2,500 up: mean, sd | spin error at floor 1,000, mean / worst |
| --- | --- | --- | --- |
| 1,000 (before) | 1.028, 0.121, **1.526**, 1 of 18 | 1.000, 0.003 | 0.26 / 0.75% |
| 3,000 (now) | 1.001, 0.003, 1.006, 0 of 18 | 1.000, 0.003 | 0.14 / 0.22% |

Over all nine builds (0.2, 0.4 and 0.8 s lags; eval/hold-rpm-told-lag-2026-11-16.txt) the spin error at floor 1,000
went from 0.55 to 0.39% mean, worst 1.72 to 1.74%: better at 0.4 s (0.26 to 0.14%) and 0.8 s (0.83 to 0.08%),
worse at 0.2 s (0.57 to 0.96%), where no wheel was far off before either. Speed error stayed at 0.1% or less. So set
`ESC_TAU_US` from the survey before a calibration drill; on a laggy ESC the hold makes things worse without it.

**Not known.** All of it is the simulator's first-order wheel and first-order ESC. Holding costs a shot up to 0.5 s
before its wheels start changing speed; whether that makes any shot late against its interval was not measured. Wheels under 750 rpm still read 0.96-1.18 of their drop even
when held: the verdict 250 ms after the stroke leaves them only three or four revolutions.

## A tach that averages a fixed time (2026-11-16, later; built, off by default)

**The item.** `PeriodTach` averages its last four revolutions, so its reading trails the wheel by about 2.5
revolutions, 0.29 s at 510 rpm. "Slow wheels need slower gains" worked around that delay by cutting the loop's gains
under 1,500 rpm. Would averaging a fixed time instead shrink the delay itself?

**The change.** `PeriodTach(window_us=...)` averages the newest periods until they span the window, at most four:
at 40 ms, one revolution under 1,500 rpm, two to 3,000, four from 6,000. `controller.TACH_WINDOW_US` sets it for the
board's tachs; it is **0 (four revolutions, as before)**, for the reason below. `tests/low_speed_loop_sweep.py
--window 0,40,60` runs the 336 slow-wheel cases at each window; `--margins --window` gives the linear model's margins.

**It settles slow wheels better.** Phase margin, 30 ms ESC, 0.2 s wheel (eval/tach-window-margins-2026-11-16.txt):
510 rpm -48 degrees with neither change, 32 with the window alone, 63 with the scaled gains alone, 84 with both.
On the simulator (eval/tach-window-sweep-2026-11-16.txt; the scaled gains and 6-revolution hold on):

| tach | never steady | passed over 3% off | worst at the gate | median / slowest time to steady |
| --- | --- | --- | --- | --- |
| four revolutions (default) | 0 | 14 | 7.0% | 3.76 / 11.62 s |
| 40 ms | 0 | 7 | 3.3% | 3.75 / 9.12 s |
| 60 ms | 0 | 6 | 3.4% | 3.76 / 9.11 s |

With the window and no gain scaling: 3 over 3%, worst 3.5%. The drill's wheel pairs (`tests/wheel_loop_sweep.py`,
eval/tach-window-wheel-pairs-2026-11-16.txt) are unchanged at worst: 3.3% at the gate, 6.2% over the next 2 s,
slowest 5.12 s, with or without it. (That 3.3% is also what main reads today; the 2.6% in "Slow wheels need
slower gains" was measured before some later change and is stale.)

**It costs the drop fits.** On the slow drill (30 ms ESC plant, 0.4 s wheel, three builds, board told no ESC lag) the
40 ms window put the record drops 3-5% low from 750 to 2,500 rpm, and the launcher's spin error at the 1,000 floor
went from 0.55 to 5.67% mean. On the first-order plant it did no harm (0.84 to 0.37%), and with the board told the
lag it was close to the default (0.40 / 0.59% against 0.14 / 0.22%, the 500-750 band worse: 0.955 mean against
0.996). So the faster readings drive the loop harder inside the recovery, where an untold ESC lag shows most.
The gate gains are real but the fits matter more and the scaled gains already settle every case, so the default
stays four revolutions. Raw: eval/tach-window-drill-2026-11-16.txt.

**Not known.** A real tach's dropouts and a real ESC's own speed loop, either of which might favour one side.

## Slow wheels watched past the verdict (2026-11-16, last)

**The item.** "The 1.48x wheel" left 500-750 rpm wheels reading 0.96-1.18 of their drop even when the Pi held the
next speeds: the verdict comes 250 ms after the stroke, about 0.39 s after the ball, and at 520-750 rpm that is three
or four revolutions. `drop_from_commands_steps` wants eight after its anchor. The drill's last shot was worse: the Pi
sent the final stop straight after the release, which froze the snapshot with one or two revolutions in it.

**The change.** The verdict and the record still go out 250 ms after the stroke. When a launched stroke's turning wheel
has fewer than `controller.LOOP_AFTER_REVS` (8) revolutions after the fit's anchor and the targets have not changed,
`LaunchCheck` keeps watching that wheel: it logs its control ticks (`TICK_LOG` is 240 now) until the tach has the
revolutions, the targets change, a stroke starts, a stop comes or `EXTEND_MS` (1.2 s) passes, then re-takes that wheel's
periods and runs the loop fit on them (the record says "loop fit under way" meanwhile, as before). Only wheels under
about 1,500 rpm are ever short; a faster wheel keeps the verdict's snapshot. On the Pi, `host.hold_s(shot)` says how
long after a release the next speeds wait: the verdict for a wheel under `HOLD_RPM`, and for a slower one
(`LOOP_AFTER_REVS` + 2) revolutions less the 0.14 s the ball comes before the release, at most 1.45 s. The drill's
final stop now waits the same hold, and `LOOP_FIT_S` (how long a re-plan waits for the fit) is 3 s, up from 2.

**How close (simulated).** `tests/min_fit_rpm_sweep.py --hold 3000 --extend 0,8 --told`: the slow drill (slow wheels
planned at 520-1,500 rpm) and the calibration drill, three plants, wheel lags 0.2 / 0.4 / 0.8 s, three true launchers,
the board told its ESC lag (as after its survey). Record drop over the simulator's true drop:

| 500-750 rpm wheels | >2% off | range |
| --- | --- | --- |
| before (verdict snapshot), all three plants | 73 of 156 | 0.631-1.840 |
| watched past the verdict | **0 of 156** | 0.992-1.009 |

Every band from 750 rpm up reads as before (0 wheels over 2% off below 2,500 rpm on any plant; the jittery tach's 34
of 360 above it are its jitter, as before). The launcher fit, spin efficiency error mean / worst:

| plant | floor 1,000 (shipped), before | now | floor 500 (none), before | now |
| --- | --- | --- | --- | --- |
| first-order (8 builds) | 0.43 / 1.51% | 0.28 / 1.24% | 8.53 / 18.39% | 0.32 / 0.95% |
| tach 5 us (9) | 0.86 / 2.81% | 0.59 / 1.57% | 10.72 / 31.49% | 0.42 / 1.01% |
| ESC 30 ms, told (9) | 0.42 / 1.74% | 0.22 / 0.67% | 12.42 / 38.03% | 0.30 / 0.73% |
| ESC 30 ms, untold (9) | 2.22 / 8.63% | 2.77 / 8.67% | 8.94 / 33.35% | 2.07 / 3.22% |

The speed efficiency stays within 0.3% told (2.6% mean untold, the untold lag's bias, as before). The 30-shot slow
drill took 126.4 s against 124.1 s at a 0.2 s wheel lag. Raw output: eval/slow-wheel-watch-2026-11-16.txt.

**The floor stays at 1,000 rpm for now.** With the watch, slow wheels read as well as fast ones, and with no floor the
worst spin error is lower on three of the four rows. But the means are mixed (0.32 against 0.28 on the first-order
plant) and the choice would be made on the builds it is scored on; a held-out set (other seeds, launchers and lags)
should decide it. Untold, the ESC plant's slow wheels now read 0.96-0.98 of their drop, the same untold-lag bias the
1,000-1,500 band always had: set `ESC_TAU_US` from the survey.

**Also seen, not this change.** On the first-order plant at a 0.8 s wheel lag, build 0.95 / 0.35, the slow drill
aborts at its third shot ("release not done in 2.0 s") with or without the watch, and on main before it.

**Not known.** All of it is the simulator's first-order wheel. The extra 80 ticks of log cost about 7 KB of heap per
stroke under MicroPython (counted, not measured on an ESP32). A slow shot now waits up to 1.45 s after its release
before the wheels change speed; on the slow drill that cost 2.3 s over 30 shots, but against a tight interval it may
make a shot late.

## The slow drill's release timeout (2026-11-16, after the watch)

**The item.** "Slow wheels watched past the verdict" saw the slow drill abort at its third shot (shot 2, "release not
done in 2.0 s") on one build, the first-order plant at a 0.8 s wheel lag, 0.95 / 0.35, with or without the watch and on
main before it.

**The cause: the gate shut again after the Pi had fed.** Shots 1 and 2 both plan 6,065 / 526 rpm. After shot 1 the
slow wheel undershoots, as a 0.8 s wheel braking under the speed-scaled gains does: it reads 507 rpm, 3.6% low, and
creeps back at about 10 rpm a second. The gate's band at 526 rpm is 510-542. At 25.2 s one reading of 511 rpm finished
the gate's hold (six revolutions, 684 ms), the flag cleared, and the Pi sent FEED. The next reading was 509. The gate
reset and the queued ball waited. The wheel crept back into the band at 25.9 s, held it for 684 ms and the stroke began
at 26.6 s. The stroke takes `GATE_OUT_MS` (900 ms), so the release would have counted at about 27.5 s, but the Pi's
release timeout was a flat 2.0 s from the FEED and ran out at 27.2 s. It latched the e-stop on a machine that was
doing what it should. The trace is in eval/slow-drill-release-timeout-2026-11-16.txt (tests/release_timeout_trace.py).

The firmware was right to wait: the gate holds the wheels within 3% for six revolutions because a ball fed on a slipping
wheel flies short. The 2 s was meant for the stroke, about 0.9 s, plus margin. It was never meant to cover a gate that
re-checks a slow wheel, and at 526 rpm the hold alone is 0.68 s.

**The change (host only).** `run_drill`'s release wait now counts its 2 s from the last telemetry frame that shows the
feed gate shut (`FLAG_WHEELS_SETTLING` or `FLAG_AIM_SETTLING`, `host.GATE_SHUT`). A shut gate can stretch the wait by
`ready_timeout_s` (10 s) at most, so a wheel that never settles still aborts. A lost FEED frame or a shuttle that never
strokes on an open gate still aborts 2 s after the FEED, as `test_lost_feed_frame_aborts_and_drops_the_queued_ball`
checks. Two new tests in tests/test_host.py hold the gate shut for 1.5 s after the FEED (the drill now finishes; on
main it aborts) and for 30 s (it aborts at the cap).

**Simulated.** The build that aborted runs all 30 shots of the slow drill. Shot 2 releases at 27.5 s, 2.3 s after its
FEED. The 30 releases ran from 12.8 s to 164.8 s. `tests/min_fit_rpm_sweep.py --plant 0 --lags 0.8 --builds 1 --hold
3000 --extend 8 --told` now scores it: all 60 launched wheels read within 2% of the true drop (500-750 rpm: 0.996-1.001),
and the launcher fit's spin efficiency is 0.33% off at the shipped 1,000 rpm floor (0.17% with no floor), speed 0.01%.
Raw: eval/slow-drill-release-timeout-sweep-2026-11-16.txt. The earlier tables in "Slow wheels watched past the
verdict" left this build out, so their first-order rows have 8 builds, not 9.

**Still open.** The undershoot itself: under the speed-scaled gains a 0.8 s wheel braking to 526 rpm settles 3-4% low and
takes about 2 s to creep back. This costs time, not accuracy, because the gate waits it out. A wheel model that is
not first-order may undershoot differently. (Answered 2026-11-17 in "A ball charged the integrator": the
integrator, charged by the ball and by the brake before it.)

## Checked before a calibration drill (2026-11-16)

**The item.** "The 1.48x wheel" ended on "set `ESC_TAU_US` from the survey before a calibration drill; on a laggy ESC
the hold makes things worse without it", and "Slow wheels watched past the verdict" said the same. Nothing checked
it. The survey line printed at a drill's end was easy to miss. The Pi did not know what the board was set to, so
`tennisbots run` advised "set ESC_TAU_US = N" even on a board already set to N. And the next calibration drill ran
regardless, wrote 12 strokes of skewed drops to the shot log, and `fit-launcher` turned them into efficiencies the
planner then aimed with.

**The change.**

- The board reports its setting. A new ESC_TAU frame (0x83, uint16 ms) follows every telemetry frame, from
  `FeederHw.esc_tau_ms` (the `LaunchCheck`'s `esc_tau_us`). On the Pi, `FeederLink.esc_tau_ms` holds it, and
  `DrillResult.esc_tau_ms` keeps what the drill ran with.
- The shot log keeps the survey. `append_shot_log` writes the drill-end ESC_SURVEY as one line of its own
  (`{"esc_survey": ..., "esc_tau_ms": ..., "at": ..., "drill": ...}`). `read_shot_log` leaves that line out, so
  `fit-launcher` sees only launch records. `last_survey_from_log` returns the newest survey. The board refits from
  its raw commands, so the pick does not depend on the setting it ran with, and the newest line holds the most wheels
  because the board's sums run from power-up.
- The check runs before the first ball. Once `run_drill` is connected, `esc_lag_check(prior_survey, board_ms)`
  compares the two. A mismatch needs at least 16 wheels in the survey, the same rule as the drill-end advice. Within
  15% counts as a match, and 0 matches only 0 (`esc_tau_matches`, now shared with `esc_survey_advice`). A drill marked
  `"calibration": true` (drill.calibration.json now is) stops before any wheel spins: `DrillResult.held` is set, no
  e-stop is latched, and `tennisbots run` exits 4 with the value to set. `--esc-lag-ok` runs it anyway. Any other
  drill only warns. A board that sends no ESC_TAU frame (older firmware) gets a warning only, never a stop.
- `tennisbots esc-lag shots.jsonl` prints the shot log's last survey and its advice. config.py already referred to
  this command, but it did not exist until now. The drill-end advice now gets the board's real setting, so it says
  "already matches" when the setting is right.

**Simulated.** `tests/esc_lag_check_sweep.py` covers six plants, wheel lags 0.2 / 0.4 / 0.8 s, two true launchers and
two board settings: 0 (the default) and 50 ms (a guess). For each build it runs the rally drill with a shot log,
starts the calibration drill with the check on, and runs that drill anyway to score the launcher fit it would have
given. Every held build is then re-flashed to the survey's pick and checked again
(eval/esc-lag-check-sweep-2026-11-16.txt). Spin efficiency error, worst / mean:

| plant | board | held | if run anyway | after re-flash to the pick |
| --- | --- | --- | --- | --- |
| first-order | 0 | 0 of 6 | 1.9% / 0.7% (let through) | - |
| first-order | 50 ms | 6 of 6 | 12.0% / 5.7% | 1.9% / 0.7% |
| ESC lag 30 ms | 0 / 50 ms | 6 / 6 of 6 | 8.7% / 4.3%, 3.8% / 2.2% | 1.9% / 0.9% |
| ESC lag 60 ms | 0 / 50 ms | 6 / 0 of 6 | 9.5% / 5.9%, 0.9% / 0.6% (let through) | 0.9% / 0.4% |
| ESC lag 80 ms | 0 / 50 ms | 6 / 6 of 6 | 11.8% / 5.5%, 1.5% / 0.8% | 1.0% / 0.5% |
| ESC lag 150 ms | 0 / 50 ms | 6 / 6 of 6 | 16.1% / 5.6%, 4.6% / 1.8% | 1.1% / 0.6% |
| ESC lag 100 ms, 3 us jitter | 0 / 50 ms | 6 / 6 of 6 | 11.4% / 5.1%, 2.2% / 1.4% | 1.7% / 0.9% |

No held drill fed a ball, and no build was held again after the re-flash. The two let-through groups are the right
calls: a first-order build at 0, and a 60 ms ESC told 50 ms, which is within 15% of its 54-55 ms pick. Some holds are
cautious: an 80 ms ESC told 50 ms would have read 1.5% at worst, against 1.0% after the re-flash. The tolerance holds
anything over 15% off, because the cost of a wrong setting depends on the build, and a re-flash costs a minute.
On this firmware, a first-order build told 50 ms reads 12.0% off at worst. The 41-44% in "An ESC lag picked from the
build's own balls" was measured before the survey, the trim and the slow-wheel changes. Tests: four new ones in
`EscSurveyTest` (tests/test_host.py).

**Not known.** All of it runs on the simulator's first-order wheel and first-order ESC. Under MicroPython, the
ESC_TAU frame adds 5 bytes per 100 ms telemetry period, which is negligible at 115,200 baud, but this has not been
run on an ESP32. A survey logged before an ESC or its firmware was changed is stale, and the check cannot tell. In
that case run the rally drill again, or pass `--esc-lag-ok` once.

## A ball charged the integrator (2026-11-17)

**The item.** "The slow drill's release timeout" left this open: under the speed-scaled gains a 0.8 s wheel braking to
526 rpm settles 3-4% low and takes about 2 s to creep back. Why?

**Two causes, both the integrator learning something it should not.** The bottom wheel of that build (first-order
plant, 0.8 s wheel, 0.95 / 0.35) logged through the slow drill's first shots (tests/ball_integrator_trace.py,
eval/ball-integrator-trace-2026-11-17.txt):

- **A ball.** Shot 1's ball takes the 526 rpm wheel to about 300 rpm. The tach's four-revolution average shows that
  about 0.3 s late, and through the whole climb back the loop integrates a large error. The integrator reaches +0.022
  of full throttle, about 200 rpm of command on top of the feedforward, and the wheel runs through its target to
  625 rpm, 19% high. Discharging, the integrator passes zero to -0.004, which holds the wheel at 507 rpm, 3.6% low,
  and at the scaled gains it creeps back at about 10 rpm a second. That is the undershoot the item saw.
- **The brake before it.** Shot 0 to shot 1 lowers the wheel from 3,895 to 526 rpm. `SpinupRamp` lowers the target at
  up to 1,500 rpm a second, faster than a 0.8 s wheel slows at low speed, and the loop integrated that tracking error
  until the integrator reached -0.164, nearly three times the 526 rpm feedforward (0.058). The command sat at zero,
  the wheel coasted to about 90 rpm, came back through its target to 620 rpm and settled 3% low too.

**The changes.** All three are in `controller.WheelLoop`; `None` / `False` on each constant is the loop before.

- **Ball hold** (`LOOP_BALL_BAND` 0.5%). A ball is a known kick, not an offset to learn, and the board starts every
  stroke itself: `FeederHw.update` calls `WheelLoop.ball()` for both wheels as each stroke starts. From then until the
  wheel has read `BALL_DROP_SEEN` (3%) under target and come back to it, the target changes or `LOOP_BALL_MS` (3 s)
  passes (an empty pocket), the integrator sees its error clamped to +-0.5% of the target. Feedforward and the
  proportional term do the recovery, and the integrator keeps the offset it learned before the ball.
- **Ramp hold** (`LOOP_RAMP_HOLD`). While the ramp is still lowering a wheel's target, the integrator holds. Only
  downward: holding it on the way up delayed learning a wheel slower than `WHEEL_RPM_FULL` by 0.7-0.9 s on
  `tests/wheel_loop_sweep.py`'s 7,000 rpm cases.
- **A bound tied to the feedforward** (`LOOP_I_FF_MAX` 0.35). The integrator stays within 35% of the feedforward
  (and `i_max`, as before). Its job is the gap between the real wheel and `WHEEL_RPM_FULL`: a wheel 22% slower than
  told (7,000 against 9,000, the sweeps' worst) needs 29%. 0.5 was also tried and did less (braking: mean 5.32 s,
  worst 9.26 s, against 4.97 / 7.85 at 0.35).

**Clamping the integrator all the time was tried first, and is wrong.** A 1% clamp everywhere fixed the ball's
recovery as well, but on `tests/low_speed_loop_sweep.py` (336 slow-wheel spin-ups) it left 125 cases never steady in
12 s (0 on main): it starves the integrator of the one thing it is for, a wrong free speed.

**Simulated.** Three sweeps, each on four plants (first-order, 5 us tach jitter, 30 and 80 ms ESC lag), wheel lags
0.2 / 0.4 / 0.8 s and free speeds 7,000 and 11,000 rpm against the 9,000 told.

`tests/ball_recovery_sweep.py`: a wheel pair steady, one FEED through the firmware's own stroke, then the time until
the gate, once the tach has seen the drop and shut it, passes again. Nine pairs, 216 cases
(eval/ball-recovery-final-2026-11-17.txt; the band alone, before the ramp hold and bound: eval/ball-recovery-hold-2026-11-16.txt):

| loop | gate passes again: median / mean / worst | 6,065 / 526 rpm, mean | over 3% off at the gate | overshoot worst | undershoot over 2% (0.8 s wheels) |
| --- | --- | --- | --- | --- | --- |
| before | 0.93 / 1.37 / 4.96 s | 3.03 s | 11 | 17.8% | 24 of 216 (12 of 72) |
| ramp hold and bound only | 0.84 / 1.21 / 4.93 s | 2.52 s | 12 | 17.8% | 23 (10) |
| shipped (with the ball hold) | 0.69 / 0.89 / 2.43 s | 1.79 s | 1 | 6.0% | 19 (0) |

`tests/brake_settle_sweep.py`: a pair steady at 3,895 or 5,000 rpm, then a slow pair (6,065 / 526, 3,500 / 510, 750,
1,000), 192 cases (eval/brake-settle-2026-11-17.txt):

| loop | steady: median / mean / worst | over 3% off at the gate | slow wheel's lowest, worst | overshoot worst |
| --- | --- | --- | --- | --- |
| before | 5.50 / 5.91 / 10.97 s | 12 | 11% of target | 31.1% |
| ramp hold only | 5.66 / 5.89 / 10.44 s | 9 | 20% | 17.5% |
| shipped | 5.07 / 4.97 / 7.85 s | 7 | 69% | 10.2% |

On the 0.8 s wheels the mean went from 7.85 to 5.79 s. What is left of the dip is the proportional term working on a
tach reading that trails the wheel by 0.3 s at these speeds, not the integrator.

Spin-ups, which the ball hold does not touch: `tests/low_speed_loop_sweep.py` (336 cases) median 3.76 to 3.51 s,
worst 11.62 to 7.63 s, 14 to 12 balls that could go over 3% off, worst error at the gate 7.0 to 4.2%
(eval/low-speed-loop-ramp-hold-2026-11-17.txt). `tests/wheel_loop_sweep.py` (the drill's pairs from rest, 36 cases)
worst 5.12 to 5.29 s, error at the gate 3.3 to 3.1%, over the next 2 s 6.2 to 6.4%
(eval/wheel-loop-ramp-hold-2026-11-17.txt): a small cost, from the bound.

**The build that started it.** On the trace's build, braking to 526 rpm now bottoms at 429 rpm (about 90 before) and
peaks at 547 (620), the integrator stays at -0.016 (its bound is -0.020), and after shot 1's ball the wheel tops out
at 528 rpm (625). Shot 1 is released at 20.87 s (21.47 before) and shot 2 at 24.87 s (27.34).

**Whole drills.** `tests/ball_hold_drill.py --plants 0,2 --lags 0.4,0.8` runs the 30-shot slow drill of
`tests/min_fit_rpm_sweep.py` and the calibration drill on the first-order and 30 ms ESC plants, three true launchers,
with the loop before and as shipped, the board told its ESC lag, `HOLD_RPM` and `LOOP_AFTER_REVS` as shipped: 24
drills, none aborted (eval/ball-hold-drill-2026-11-17.txt, rows in the .jsonl beside it).

| plant | loop | slow drill, mean / worst | record drop / true drop, >2% off | spin efficiency error, mean / worst |
| --- | --- | --- | --- | --- |
| first-order | before | 140.8 / 151.9 s | 0 of 360 | 0.16 / 0.33% |
| first-order | shipped | 134.9 / 142.5 s | 0 of 360 | 0.31 / 0.51% |
| ESC 30 ms | before | 143.6 / 157.0 s | 0 of 360 | 0.21 / 0.67% |
| ESC 30 ms | shipped | 135.9 / 143.7 s | 0 of 360 | 0.17 / 0.31% |

Every drill is faster: 2.5-3.8 s on the 0.4 s wheels, 8.2-14.6 s on the 0.8 s wheels. The record drops read as well
as before (range 0.990-1.010 against 0.993-1.009), and the launcher fit moves by less than 0.2 points either way
(worse on the first-order plant, better behind the ESC); speed efficiency stays within 0.1%. The 0.2 s wheels and the
jittery tach were not run here, to keep the run under an hour.

**Where it does worse.** On 0.2 s wheels the ball's undershoots over 2% went from 7 to 17 of 72. Every one is a
wheel whose free speed is 11,000 rpm against the 9,000 told: there the proportional term overshoots on its own (the
plant's gain is 1.22 times what the loop assumes), and the integrator's charge used to cushion the approach. The
worst is 4.5% (4.4% before), one ball in the 216 would leave over 3% off, and most of those cases recover sooner.
Measuring `WHEEL_RPM_FULL` on the build removes the mismatch. The values (0.5%, 0.35) were picked on these same cases;
the ball band is flat from 0 to 1.5%, the bound is not.

**Not known.** All of it is the simulator's first-order wheel and first-order ESC. A real ESC with a throttle
deadband at low speed may need more than 35% of the feedforward to hold a slow wheel; a wheel that then never passes
the gate aborts the drill at `ready_timeout_s`, and raising `LOOP_I_FF_MAX` (or measuring `WHEEL_RPM_FULL` at low
throttle) is the fix. An ESC running its own speed loop may answer a ball differently. Tests:
`test_ball_hold_keeps_the_drop_out_of_the_integrator`, `test_ball_hold_times_out_and_can_be_off` and
`test_braking_does_not_wind_the_integrator` (tests/test_host.py).

## The fit floor on held-out builds (2026-11-17)

**The items.** "Slow wheels watched past the verdict" left `launcher.MIN_FIT_RPM` at 1,000 rpm until a held-out set
decided it, and asked whether the Pi's hold for slow wheels (`host.hold_s`, up to 1.45 s after a release) makes shots
late.

**The held-out set.** `tests/min_fit_heldout.py` uses nothing the earlier sweeps used: true launchers 0.78 / 0.42,
0.88 / 0.55 and 0.83 / 0.28; wheel lags 0.3 and 0.6 s; three plants, a first-order wheel whose free speed is 8,000 rpm,
3 us of tach jitter on a 10,000 rpm wheel and a 50 ms ESC lag (told), all against the 9,000 the board is told;
simulator seed 7; and a slow drill with other targets (540-1,450 rpm), a 20 m/s serve to 8.0 m, topspin and backspin
swapped. The decision rule was committed with the script before it ran: drop the floor to 500 (in effect none) only if
the pooled spin-efficiency error is lower at 500, lower or equal on two plants of three, and no plant's worst build is
more than 0.25 points worse. 18 builds, none aborted (eval/min-fit-heldout-2026-11-17.txt, rows in the .jsonl beside it).

**The floor stays at 1,000 rpm.** Every slow wheel reads its drop well (500-1,000 rpm: 0 of 180 over 2% off, range
0.986-1.012), but counting them in the fit does not help on every plant. Spin efficiency error, mean / worst:

| plant | floor 500 | floor 750 | floor 1,000 (shipped) |
| --- | --- | --- | --- |
| first-order, 8,000 rpm free | 0.27 / 0.54% | 0.55 / 0.83% | 0.58 / 1.56% |
| tach 3 us, 10,000 rpm free | 0.61 / 0.97% | 0.71 / 1.97% | 0.56 / 1.26% |
| ESC 50 ms, told | 0.84 / 2.33% | 0.43 / 1.48% | 0.53 / 1.47% |

Pooled, 0.57% at 500 against 0.56% at 1,000: the rule fails on (a), (b) and (c), the last on the ESC plant, whose worst build
is 2.33% against 1.47%. The speed efficiency is within 0.17% at every floor. The floor is no longer what
limits the fit; on the first-order plant the slow wheels would help, behind an ESC lag they hurt.

**The hold makes one shot in three late.** Each shot's release against the previous release plus the interval, paired
with the same build run with no hold (every gap also carries the 1.0 s feed stroke):

| interval | fast shot to slow | slow to the same slow | slow to fast |
| --- | --- | --- | --- |
| 3.0 s, hold as shipped | +0.00 s, 0 of 162 over 0.25 s | +0.00, 0 of 162 | **+0.63 s mean, worst 1.30; 113 of 144** |
| 2.0 s, hold as shipped | +0.00, 0 of 162 | +0.00, 1 of 162 | **+0.88 s mean, worst 1.70; 141 of 144** |

A slow shot followed by itself costs nothing (the next shot needs no speed change), but the shot after it that needs
a big speed change waits out the hold before it can start spinning up. The slow drill took 117 s against 112 s.

**The change, opt-in: watch through the speed change.** The watch past the verdict stopped when the targets changed,
because a speed change's pulses are not the ball's. But the loop-command fit models the wheel as a lag of every command
the board sent, and the next shot's speed change is only more commands: the drop stays separable from the command
response while the wheel follows its commands. With `controller.LOOP_THROUGH_CHANGE` the board keeps logging a short
wheel's periods and ticks through a change of speed (never through a stop: a coast down is the ESC's braking, which no
command describes), and with `host.LOOP_THROUGH_CHANGE` the Pi sends the next speeds straight after the release. The
verdict and the parabola's snapshot still freeze at the change. The hold before the drill's final stop stays.

Same 18 builds and drills (no value in it was tuned, so these are not its design set):

| plant | record/true, >2% off (range) | spin error at 1,000: hold / through | at 500: hold / through |
| --- | --- | --- | --- |
| first-order | 0 of 324 both (0.988-1.011 through) | 0.58 / 1.56% to **0.09 / 0.27%** | 0.27 / 0.54% to 0.22 / 0.38% |
| tach 3 us | 3 to 8 of 324 (0.971-1.024) | 0.56 / 1.26% to 0.55 / **2.16%** | 0.61 / 0.97% to 0.59 / 1.27% |
| ESC 50 ms told | 0 of 324 both (0.992-1.012) | 0.53 / 1.47% to **0.17 / 0.41%** | 0.84 / 2.33% to 1.28 / 3.53% |

Lateness through: 0 of 468 gaps later than with no hold at either interval, so the slow drill's span is back to 112 s
(99.5 s at 2.0 s). Slow wheels read as before (under 1,000 rpm, 0.986-1.012). The jittery tach is where it does worse:
five more fast wheels past 2%, and one build's spin error worst 2.16% against 1.26%.

**Off by default.** On the simulator the wheel *is* a first-order lag of its command, the model the fit assumes, so a
fit across a 5x speed change is its best case. A real wheel that leaves that model over a big change (an ESC's own
speed loop, a current limit on spin-up, belt slip) would bias the drop of every slow ball that comes before one. Turn
it on (both constants) once a real wheel's tach and command log across a speed change fits as well as one without.

**Not known.** All simulated. Tests: `test_slow_wheel_is_watched_through_the_next_speed_change`,
`test_a_stop_still_ends_the_watch_through_changes` (tests/test_host.py).

## The jittery tach through a speed change (2026-11-17)

**The item.** "The fit floor on held-out builds" found the 3 us tach-jitter plant the one plant where watching through
the speed change (`LOOP_THROUGH_CHANGE`) did worse: 8 of 324 wheels more than 2% off against 3 with the hold. Was it
the change, or chance?

**Two predictions.** If the change is the cause, the misses cluster on wheels whose loop fit ran on periods through the
next shot's speed change, and stay there on other seeds. If it is chance, they land where they did with the hold: the
through mode sends the next speeds sooner, so every later tach edge draws a different jitter sample from the
simulator's random stream, and other seeds move the count either way. A third candidate came from reading the code:
the tach keeps 128 periods (`PERIOD_RING`) and a snapshot taken through a speed-up might outrun it, losing the ball's
revolutions while the tick log still counts from the stroke's first edge. That one is out: on the worst build the
longest snapshot was 103 periods, in both modes.

**The run.** `tests/through_jitter_cause.py` tags each launched wheel by how its loop fit was made ("crossed": the
targets changed before the verdict; "watched": a slow wheel watched past its verdict; "plain") and runs the held-out
builds (three launchers, two lags, the 3 us plant, the slow drill at 3.0 s) on seeds 7 to 12, hold and through: 72
drills, 3,888 wheels, none aborted (eval/through-jitter-cause-2026-11-17.txt, rows in the .jsonl beside it).

**Chance.** Wheels more than 2% off, hold / through, per seed:

| seed | 7 (held-out) | 8 | 9 | 10 | 11 | 12 | all |
| --- | --- | --- | --- | --- | --- | --- | --- |
| off by > 2% | 3 / 8 | 7 / 7 | 5 / 5 | 5 / 8 | 8 / 4 | 7 / 6 | 35 / 38 |

Paired wheel by wheel (same seed, build, shot and wheel), the through mode's error is 0.02 points *smaller* on average
(1,944 pairs). Seed 7 was the through mode's worst draw of the six.

**Where the misses are.** The same class in both modes: the fast partner wheel of a slow shot (2,500 rpm and up, a
shot whose other wheel was watched past its verdict). It misses by over 2% 5.1% of the time with the hold and 5.5%
through, sd 1.00% in both, with no bias (-0.05%). A fast shot's wheels whose targets changed before the verdict
miss 0.3% / 0.5% of the time (sd 0.60% / 0.62%). The slow wheels themselves: 0 of 360 under 1,000 rpm over 2% in either mode,
sd 0.45% hold, 0.40% through.

| fit | band | hold: off > 2%, sd | through: off > 2%, sd |
| --- | --- | --- | --- |
| crossed (fast shot) | >= 2,500 | 2 of 648, 0.60% | 3 of 648, 0.62% |
| watched (slow shot) | < 1,000 | 0 of 360, 0.45% | 0 of 360, 0.40% |
| watched (slow shot) | >= 2,500 | 32 of 632, 1.00% | 35 of 639, 1.00% |

**What changes.** No code: the through mode stays opt-in for the reason it was (a real wheel across a 5x speed change),
not for jitter. The one-build spin error of 2.16% was this draw too; the spin fit was not rerun over the six seeds.
The jitter noise worth chasing is the slow shot's fast wheel, whatever the mode: sd 1.0% where a fast shot's wheels
have 0.6%. Next: whether the board's LOOP_UNSURE flag marks those wheels, and whether the Pi's fit should weight them down.

**Not known.** All simulated; the jitter is the simulator's Gaussian 3 us per edge.

## Unsure marks on the noisy wheels (2026-11-17, later)

**The item.** "The jittery tach through a speed change" found the noisiest readings in one class, the fast partner
wheel of a slow spin shot: sd 1.0% of the true drop, where a fast shot's wheels have 0.6%. Does the board's
`LOOP_UNSURE` mark (LAUNCH flags bits 6 / 7, the loop fit's own standard error over 1% of its drop) find those
wheels, and should the Pi's launcher fit count a marked reading for less?

**The run.** `tests/unsure_weight.py` runs the calibration drill and the held-out slow drill on min_fit_heldout's 18
builds (three launchers, two wheel lags, three plants), hold mode, on seeds 7, 8, 13 and 14: 72 builds, none aborted.
It logs every wheel's mark and the loop fit's standard error, and refits the launcher as the Pi does (floor 1,000
rpm) with `launcher.fit_from_drops(unsure_weight=w)`, a new argument that counts a marked reading w times. The
decision rule was committed with the script before it ran: pick the best of w = 0.5, 0.25, 0 on seeds 7 and 8, and
ship it only if it beats w = 1 on seeds 13 and 14 on the mean spin error and on two plants of three, without making
a plant's worst build 0.25 points worse or the speed 0.1 points worse. Raw: eval/unsure-weight-2026-11-17.txt and
the .jsonl beside it.

**The marks find the noisy wheels.** On the first-order and ESC 50 ms plants no wheel at 1,000 rpm or more was
marked, as on 2026-11-16. On the 3 us jittery tach (1,632 wheels at the fit's floor or above):

| class | wheels | marked | > 2% off | of those, marked | sd marked | sd unmarked |
| --- | --- | --- | --- | --- | --- | --- |
| calibration drill | 576 | 94 | 5 | 4 | 0.98% | 0.59% |
| slow drill, fast shot | 452 | 19 | 2 | 1 | 0.81% | 0.57% |
| slow drill, slow shot's fast wheel | 604 | 246 | 16 | 11 | 0.99% | 0.72% |

So the noisy class is the marked class: 41% of the slow shot's fast wheels came marked against 4% of a fast shot's,
and 16 of the 23 misses over 2% were marked (22% of wheels marked in all). A marked reading is over 2% off 4.5% of
the time, an unmarked one 0.55%. The standard error tracks the true error: wheels with a standard error under 0.5%
read 0.33% rms off, 0.5-1% read 0.73%, 1-2% read 0.98%.

**But weighting them down does not help the fit.** Spin efficiency error, mean (worst build), all plants:

| seeds | w = 1 (shipped) | 0.5 | 0.25 | 0 (set aside) |
| --- | --- | --- | --- | --- |
| 7, 8 (design) | 0.58% (1.60) | 0.57% (1.71) | 0.58% (1.79) | 0.58% (1.89) |
| 13, 14 (held out) | 0.54% (1.75) | 0.55% (1.74) | 0.56% (1.73) | 0.59% (1.72) |

The design seeds picked 0.5 by 0.01 points; on the held-out seeds it was 0.01 points worse, so the rule keeps 1.
Only the jittery plant moves at all; the other two have no marks, and their simulator draws no random numbers, so
their rows are the same on every seed.

**Why: the fit's error is spread over every reading, not carried by the marked ones.** On the 24 jittery builds the
spin error is 0.57% mean as read. With every reading replaced by the simulator's true drop it is 0.03%, so the
readings' noise is nearly all of it. With only the marked readings made true it is 0.44%, and with only the 23
readings over 2% off made true, 0.52%. Even a perfect correction of the marked readings wins 0.13 points; down-weighting
them, which also throws away the signal they carry (their sd is about 1.4x the rest, an inverse-variance weight near
0.5), wins nothing measurable. The marks stay what they were: a warning about the build (the note at 10% marked),
not a filter.

**What changes.** `fit_from_drops` takes `unsure_weight` (default 1, so nothing changes). Next on this thread is
lowering every reading's noise rather than sorting readings: the remaining 0.57% is what 3 us of jitter on each
revolution leaves in the loop fit's drop.

**Not known.** All simulated, with Gaussian per-edge jitter; a real tach's misses may be lumpier (a missed edge, a
noisy interrupt), and there marks could carry more of the error than here.

## The spin error was there without the jitter (2026-11-17, last)

**The item.** "Unsure marks on the noisy wheels" ended on lowering every reading's noise under the 3 us tach jitter:
with every reading replaced by the simulator's true drop, the jittery plant's spin error fell from 0.57% to 0.03%.
But the same run's other two plants draw no random numbers at all, and their spin error was 0.58% (first-order) and
0.53% (ESC 50 ms told). So the jitter was never what set the floor.

**Where it sits.** The same oracle on every plant, from the run's saved rows (no rerun; seeds 7, 8, 13, 14;
`tests/reading_floor.py --oracle`, eval/reading-floor-oracle-2026-11-17.txt):

| plant | as read | every reading true | calibration drill true | slow drill true | reading sd |
| --- | --- | --- | --- | --- | --- |
| first-order 8k | 0.58% | 0.02% | 0.46% | 0.15% | 0.32% |
| tach 3 us 10k | 0.57% | 0.03% | 0.59% | 0.18% | 0.72% |
| ESC 50 ms told | 0.53% | 0.03% | 0.50% | 0.06% | 0.27% |

On every plant the readings carry the error, and the held-out slow drill's readings carry most of it (its spin shots
are where the fit learns spin). On the noise-free plants the readings have no bias (mean 0.9993 and 0.9999 of the true
drop) and no trend with speed: a 0.27-0.32% scatter, the same from 1,000 to 9,000 rpm. The jitter widens a reading's
scatter 2.3 times and leaves the spin error where it was.

**Is it the 1 us timer?** The simulator times each tach edge to a whole microsecond, as `ticks_us` does on the ESP32.
`tests/reading_floor.py` reruns the noise-free builds (three launchers, two lags, both plants, calibration plus the
slow drill) with the edges timed exactly (float microseconds) and nothing else changed. The prediction was written into
the script before it ran: if the timer is the floor, the reading sd falls by more than half; if it stays within a
quarter, the floor is the drop fit's model against the simulator's physics. The shipped half reproduced the earlier
run's readings exactly. Raw: eval/reading-floor-2026-11-17.txt and the .jsonl beside it.

| plant | edges | reading sd | spin mean (worst) | spin, true drops |
| --- | --- | --- | --- | --- |
| first-order 8k | 1 us timer | 0.32% | 0.58% (1.56) | 0.02% |
| first-order 8k | exact | 0.31% | 0.50% (1.01) | 0.02% |
| ESC 50 ms told | 1 us timer | 0.27% | 0.53% (1.47) | 0.03% |
| ESC 50 ms told | exact | 0.24% | 0.32% (0.62) | 0.03% |

**Not the timer.** The readings' scatter moved 3% and 11%, inside the quarter: the 1 us timer is not what limits a
reading. By speed band the sd went 0.34 to 0.33% (1,000-2,000 rpm), 0.30 to 0.26% (2,000-4,500) and stayed 0.28% above
4,500. The spin fit did move more than the scatter did (0.58 to 0.50%, 0.53 to 0.32%) because it leans on a handful of
slow-drill readings, so a small change in those few shows up large; on 12 builds a plant that is a spread of 0.1-0.2
points, and the rule was set on the readings, not the fit.

**What it leaves.** A noise-free reading still misses its true drop by about 0.3%, and that is between the loop fit's
model (a ball's moment inside a revolution, then the loop's recovery from its logged commands) and what the simulator
does: 1 ms Euler steps of the wheel, the ball's whole take at one step's end, the command applied a step at a time.
Part of that is the simulator's own coarseness, which a real wheel does not have, and part may be the model's. Lowering
"every reading's noise" on the board cannot win a floor the board's timer does not set, so that item is closed. The
next test is a simulator run at finer steps (0.1 ms; about ten times the run time): if the scatter falls, the floor was
the simulator's, and a real tach's log decides whether there is anything to fix; if not, the drop model has a missing
term worth finding. No firmware changes.

**Not known.** All simulated. A real ESP32's interrupt latency adds its own jitter to every edge, which this run left
out on purpose.


## Not the simulator's step either: the fit's ball-moment grid (2026-11-17, later)

**The item.** "The spin error was there without the jitter" left a 0.3% scatter between a noise-free reading and the
simulator's true drop, and asked whether a simulator at 0.1 ms steps would remove it (the floor was the simulator's)
or not (the drop model was missing a term).

**0.1 ms steps.** `tests/reading_floor.py` gained two modes that integrate the ESC lag, the wheel and its revolutions
in ten Euler steps a millisecond, each tach edge timed inside its sub-step, with the 1 us timer and with exact edges.
The firmware still ticks, and the ball's take still lands, once a millisecond: only the plant is finer. A build took
7% longer, not ten times, because the firmware's own work dominates. Same 24 builds (eval/reading-floor-fine-2026-11-17.txt):

| plant | edges, steps | reading sd | spin mean (worst) |
| --- | --- | --- | --- |
| first-order 8k | 1 us, 1 ms | 0.32% | 0.58% (1.56) |
| first-order 8k | 1 us, 0.1 ms | 0.31% | 0.26% (0.62) |
| first-order 8k | exact, 0.1 ms | 0.31% | 0.41% (1.44) |
| ESC 50 ms told | 1 us, 1 ms | 0.27% | 0.53% (1.47) |
| ESC 50 ms told | 1 us, 0.1 ms | 0.27% | 0.20% (0.40) |
| ESC 50 ms told | exact, 0.1 ms | 0.25% | 0.30% (1.17) |

The readings' scatter did not move, in any speed band. The spin fit moved both ways, as it does when a handful of
slow-drill readings shift; the rule was set on the readings. So it is not the simulator.

**Not a missing term either.** On the first-order plant the loop fit's model *is* the simulator's physics: a
first-order lag on the logged commands, a step drop at t0, each revolution's mean speed. What is left is how the fit
searches it. `tests/fit_grid_floor.py` keeps every board loop fit's inputs from the same 12 builds and refits them
offline. The prediction, written before a one-build pilot: if the search sets the floor, the finest search scatters
under 0.15%; within a quarter of the shipped one, it does not. 755 wheels at 1,000 rpm and up
(eval/fit-grid-floor-2026-11-17.txt):

| search | first-order sd | ESC 50 ms sd | steps a wheel (at most) |
| --- | --- | --- | --- |
| shipped: t0 on 3 nested 9-point grids, tau 5 golden steps | 0.32% | 0.27% | 36 |
| tau 15 golden steps | 0.31% | 0.27% | 66 |
| t0 4 levels | 0.12% | 0.13% | 48 |
| t0 5 levels | 0.10% | 0.11% | 60 |
| t0 6 levels and tau 15 golden steps | 0.07% | 0.07% | 132 |
| **polish** (one solve at the parabola's vertex) | 0.15% | 0.15% | 36 |
| polish and 4 levels | 0.11% | 0.11% | 48 |

The ball's moment was the floor. Each grid level spans a quarter of the one before, so the third's step is 1/64 of a
revolution, about 0.19 ms at 5,000 rpm; one level more cut the scatter by more than half. The lag's search did
nothing until t0 was fine.

**Shipped: polish on.** `drop_from_commands_steps(polish=True)` is now the default: after each tau's last grid it
takes the grid's best t0 and its two neighbours, solves once at their parabola's vertex and keeps that if its misses
are smaller. It adds no step (one solve beside the step's nine), so the record comes back as soon as before. The
shipped builds rerun end to end with it (eval/reading-floor-polish-2026-11-17.txt):

| plant | reading sd | speed err | spin mean (worst) |
| --- | --- | --- | --- |
| first-order 8k, before | 0.32% | 0.07% | 0.58% (1.56) |
| first-order 8k, polish | 0.16% | 0.07% | 0.31% (0.58) |
| ESC 50 ms told, before | 0.27% | 0.02% | 0.53% (1.47) |
| ESC 50 ms told, polish | 0.15% | 0.02% | 0.34% (0.72) |

A fourth level would take the readings to 0.11% for 12 more steps a wheel (0.12 s more per wheel at the 10 ms
update), which delays every re-plan; not worth it before a real board says how long a step takes.

**Not known.** All simulated, one seed, two plants. The jittery tach plant was not rerun: its 0.72% scatter is the
jitter's, and a finer t0 should not touch that. A real wheel's drop is not a step at an instant (the ball is in the
wheels for a few milliseconds), which this model and this simulator both leave out.

## A take that lasts a few milliseconds (2026-11-17, last)

**The item.** Every run so far took the ball's momentum from the wheels at one instant, and the board's loop fit models
the take as a step at one moment t0. A real ball is in the wheels for a few milliseconds: 150 mm wheels grip it over
about 50 mm while it speeds up to 18-27 m/s, so contact lasts about 2L / v = 4 to 6 ms. A revolution is 7 to 60 ms.

**The simulator.** `SimFeeder(take_ms=, take_shape=)` spreads a take over its contact time: "halfsine" (force rising
and falling symmetrically) or "front" (force at its peak at first contact, falling linearly, as when the ball slips
most while slowest). Each plant step removes the share the profile puts inside it; `sim.taken` records the speed at
first contact and the rpm taken, which is now the true drop (the wheel's speed after the take is not, since the loop
is already pushing back while it lasts). Default 0: nothing else changes.

**The run.** `tests/take_spread.py`: reading_floor's 12 builds per take (three launchers, two lags, first-order and
ESC 50 ms plants, calibration plus slow drill, seed 7), the plant at 0.1 ms with the 1 us timer for every row, the
instant take included (eval/take-spread-2026-11-17.txt, rows in the .jsonl beside it). The prediction, written
before it ran: a short take changes a revolution's time as a step at its centroid would, so the mean reading stays
within 0.1% and the sd within 0.05 points at 3 ms, 0.1 at 6 ms. The rule: any profile of 6 ms or less that moves the
mean by more than 0.3% or the sd above 0.3% means the fit needs a contact-time term.

| plant | take | reading mean | sd | > 1% off | spin mean (worst) |
| --- | --- | --- | --- | --- | --- |
| first-order 8k | instant | 0.9999 | 0.14% | 0 | 0.05% (0.12) |
| first-order 8k | half-sine 3 ms | 0.9998 | 0.30% | 7 | 0.24% (0.60) |
| first-order 8k | front 4 ms | 0.9988 | 0.50% | 21 | 0.58% (1.23) |
| first-order 8k | half-sine 6 ms | 0.9973 | 0.82% | 42 | 1.47% (2.63) |
| ESC 50 ms told | instant | 1.0002 | 0.12% | 0 | 0.15% (0.30) |
| ESC 50 ms told | half-sine 3 ms | 0.9997 | 0.27% | 7 | 0.36% (0.79) |
| ESC 50 ms told | front 4 ms | 0.9987 | 0.48% | 28 | 0.96% (1.97) |
| ESC 50 ms told | half-sine 6 ms | 0.9976 | 0.62% | 46 | 1.25% (1.92) |

**The prediction failed.** The step model holds at 3 ms (just at the rule's 0.3%) but not at 4 or 6 ms, and the miss
grows with speed, where the take is a larger share of a revolution: on both plants the 6 ms take reads 0.24% sd at
1,000-2,000 rpm and 0.91% at 4,500 and up, reading low (0.9958). A 6 ms contact puts the spin fit 1.3-1.5% off,
ten times the instant take. (The instant rows at 0.1 ms with polish also show the spin floor at 0.05% / 0.15%, down
from 0.26% / 0.20% before polish.)

**A contact-time term.** `drop_from_commands_steps(take=offsets)` models the take as equal parts starting at t0 plus
each offset, the profile's quantile midpoints (`controller.take_offsets(contact_us, shape, parts)`); the drop column
is their mean, so the solve is unchanged in size and each t0 costs `parts` times the exponentials. `tests/take_fit.py`
keeps every board fit's inputs from 9 builds (three launchers, lag 0.3 s, first-order plant at 0.1 ms; takes
half-sine 6 ms, front 4 ms, half-sine 3 ms) and refits them offline (eval/take-fit-2026-11-17.txt, inputs in the
.jsonl.gz). The prediction: at the true contact time, 4 parts bring every take under 0.3%.

The first refit missed on the 6 ms take (0.88% against the step's 0.98%), and the script's own fallback ("look at the
window") was right: t0 is searched from the start of the revolution where the fall shows, but a long take's first
contact can come before it. With `take` set, the search now starts the take's last part earlier. Readings at 1,000
rpm and up, sd about the true drop:

| fit | half-sine 6 ms | front 4 ms | half-sine 3 ms |
| --- | --- | --- | --- |
| step (shipped) | 0.98% | 0.41% | 0.21% |
| true time, 4 parts | 0.19% | 0.21% | 0.17% |
| true time, 8 parts | 0.18% | 0.17% | 0.16% |
| true time, 2 parts | 0.45% | 0.23% | 0.18% |
| a guess: 4 ms half-sine | 0.75% | 0.26% | 0.19% |
| picked per wheel (least rms of 0, 2, 3, 4, 5, 6, 8 ms) | 0.17% | 0.11% | 0.09% |
| picked per build (least summed squared rms) | 0.19% | 0.27% | 0.14% |

**The fit can name its own contact time.** Refitting each wheel at seven candidate contact times and keeping the one
whose fit misses least does as well as knowing the truth, with the half-sine shape even on the front-loaded take.
Pooled over a build's wheels, the pick named 6 ms on all three 6 ms builds and 2-4 ms on the 3 ms ones; the
front-loaded builds scattered (0, 2 and 5 ms), since no half-sine is that shape. A fixed guess is a poor substitute: 4
ms reads the 6 ms take at 0.75%.

**End to end** with `controller.LOOP_TAKE = take_offsets(6000)` on the 6 ms builds (take_spread.py's last mode, added
after the first five ran), 12 builds, readings at 1,000 rpm and up:

| plant | fit | reading mean | sd | > 1% off | speed err | spin mean (worst) |
| --- | --- | --- | --- | --- | --- | --- |
| first-order 8k | step | 0.9973 | 0.82% | 42 | 0.25% | 1.47% (2.63) |
| first-order 8k | told 6 ms | 0.9994 | 0.20% | 0 | 0.06% | 0.39% (0.83) |
| ESC 50 ms told | step | 0.9976 | 0.62% | 46 | 0.22% | 1.25% (1.92) |
| ESC 50 ms told | told 6 ms | 0.9996 | 0.18% | 0 | 0.04% | 0.35% (0.82) |

The readings hold 0.14-0.21% in every speed band. The spin fit is still two to three times the instant take's
(0.05% / 0.15%), on one seed.

**The jittery plant with polish** (the item "Not the simulator's step either" left): take_spread's fifth mode reruns
the 3 us tach plant, shipped 1 ms plant and instant take, seeds 7 and 8. Readings scatter 0.66% (0.72% before polish,
seeds 7, 8, 13, 14), the spin fit is 0.52% off (worst 1.27%; 0.57% before), and 166 of 816 wheels came marked unsure.
As expected, polish barely touches it: the jitter, not the grid, sets that floor.

**What changes.** `LOOP_TAKE` (default `()`, the step as before) passes a contact time to the board's fit; the window
widens only when it is set. Nothing turns on by default: a real ball's contact time and profile are unknown, and a
wrong guess costs as much as the step on the takes tried. Next: a contact-time survey on the board, as the ESC-lag
survey does for the lag (each launched snapshot refitted at a few contact times, squared rms summed per candidate,
the Pi picks the least), costing a few seconds of board time a ball, so run on the calibration drill only; then a
real wheel's tach log around a ball, which names the contact time directly.

**Not known.** All simulated. The take's profile is assumed (half-sine or linear); a real ball's grip includes
compression and slip that may not be either, and a real contact time may change with speed (faster wheels, shorter
contact), which a single `LOOP_TAKE` does not model. The offline refit covers one lag and one plant.

## The contact time surveyed on the board (2026-11-17, after the take)

**The item.** The section above gave the drop fit a contact-time term (`LOOP_TAKE`) but left it off, because a real
ball's contact time is unknown and a wrong guess costs as much as the step. Offline, refitting each wheel at a few
contact times and keeping the least summed squared rms named the take as well as knowing it. Now the board runs that
survey itself, and the Pi turns it into a line saying what to set.

**How.** `config.TAKE_US` (default 0, the step) sets the contact time the record's drop fit models, as a 4-part
half-sine (`LaunchCheck(take_us=)`). The new SURVEY_TAKE command (0x15) turns on the contact-time survey. After the
ESC-lag survey of each launched ball, `LaunchCheck._take_survey` refits each turning wheel at the seven contact times of
`TAKE_SURVEY_GRID_US` (0 / 2 / 3 / 4 / 5 / 6 / 8 ms), using the board's own ESC lag. It sums the squared residuals
through the same trimmed sum as the ESC-lag survey (`ResidualSurvey`), and refines the least by `survey_pick`'s
parabola. The TAKE_SURVEY frame (0x84) carries the wheel count, the least and refined times, the board's own `TAKE_US`
(0.1 ms units), each candidate's mean rms and, since 2026-11-18, the wheels summed (section "The take survey's verdict needs two informative wheels"). `host.run_drill(take_survey=True)` sends SURVEY_TAKE for a calibration
drill (`run_file` does so whenever the drill says `"calibration": true`) and turns it off at the end. `tennisbots run`
prints `host.take_survey_advice`, and the shot log keeps the survey (`last_take_survey_from_log`, also printed by
`tennisbots esc-lag`).

**Two things the first run showed.**

1. *The survey needs the tau refinement.* The ESC-lag survey fits without it (15 steps a fit). Run that way, the take
   survey picked an instant take on a 6 ms build. Without refinement the fit's misses were about 60 times the refined
   fit's (775 against 13 ppm on the first ball), so every candidate scored alike. The take survey keeps the refinement
   (36 steps a fit), about 5 s of control ticks for a two-wheel ball. Fitting the candidates at the record fit's own
   tau instead (4 steps) was no better: offline it picked 0 on a 6 ms build.
2. *A new stroke cut every survey.* At the calibration drill's 4 s interval the next ball's stroke started before the
   survey was done (11 of 12 cut). For a calibration drill the Pi now holds each ball until the board's count has risen
   by the last shot's turning wheels, or for `TAKE_WAIT_S` (8 s). With 12 balls that adds 41.8 s to the drill, and no
   survey was cut.

**The run.** `tests/take_survey_sweep.py` uses the first-order 8k and ESC 50 ms told plants at 0.1 ms with the 1 us
timer, the three launchers of min_fit_heldout.py, a wheel lag of 0.3 s and seed 7, with four takes. Per build it runs
the calibration drill with the survey on (its drops are the step's). Then a fresh board, told the advised `TAKE_US`,
runs the calibration drill and the held-out slow drill again, and the step board runs the slow drill. Output is in
eval/take-survey-sweep-2026-11-17.txt, with rows in the .jsonl.gz.

The prediction, written before the run: half-sine picks within 1 ms of the truth, instant picks at 1 ms or less, and
told the pick the 6 ms builds read better than as a step. The rule: an instant build advised over 1 ms, or a 6 ms
build reading worse told its pick, means the advice needs a margin.

| take | picks, ms (6 builds) | reading sd at 1,000 rpm and up (cal + slow): step, told | calibration spin error mean (worst): step, told |
| --- | --- | --- | --- |
| instant | 0, 0, 1.5, 2.5, 2.5, 2.5 | 0.14%, 0.33% | 0.25% (0.49), 0.57% (1.26) |
| half-sine 3 ms | 3, 3, 3, 3.5, 3.5, 4 | 0.27%, 0.17% | 0.70% (1.83), 0.42% (0.84) |
| half-sine 6 ms | 5, 6, 6, 6, 6.5, 6.5 | 0.68%, 0.24% | 0.96% (4.15), 0.68% (2.37) |
| front 4 ms | 0, 4.5, 4.5, 4.5, 5, 5.5 | 0.50%, 0.26% | 1.26% (3.41), 0.47% (1.11) |

**Half the prediction held.** Every half-sine pick landed within 1 ms of the truth, and told its pick, every spread
take read with about a third to two thirds of the step's scatter. The front-loaded take, which no half-sine matches,
picked 4.5-5.5 ms and gained as much. The rule fired twice, though. Four of six instant builds were advised 1.5-2.5
ms, and told it they read worse (sd 0.14% to 0.33%). All three first-order instant builds did this, so on that plant
the take term absorbs some misfit of the step model itself, not a take. One 6 ms ESC build picked 5 ms and its spin
fit went from 0.21% to 2.37%.

**The margin.** `host.TAKE_ADVISE_RATIO = 0.6`: the advice says "set TAKE_US" only when the best candidate's mean rms
is at most 0.6 of the step's. Otherwise it says keep 0 and gives the share. The instant builds' best came in at
0.66-0.76 of the step's. The spread takes mostly came in at 0.29-0.6, but the 3 ms builds reached 0.83, so no margin
separates an instant take from a 3 ms one. With the margin at lag 0.3 s, no instant build is advised and 2 / 4 / 5 of 6 of
the 3 ms / 6 ms / front-loaded builds are. Pooled scatter with the margin is 0.14% / 0.22% / 0.30% / 0.26%, against the
step's 0.14% / 0.27% / 0.68% / 0.50%, and the 6 ms spin fit's worst is 0.66% (step 4.15%). The bad 6 ms build (0.67) is
not advised. The 0.6 was chosen by looking at these builds. A second seed is no check here, because these plants have no noise and seed 8 matched seed 7 to the digit. So the check reruns everything at a wheel lag of 0.6 s (below).

**Not known.** All of this is simulated, and the take's profile is assumed. The first-order plant's instant-take
preference for 2.5-3 ms is a misfit not yet traced. Its cause may be the simulator's 1 ms command steps against the
0.1 ms physics, which a real ESC would not share. The survey's 5 s a ball on a real ESP32 under MicroPython is not
measured. A real wheel's tach log around a ball would name the contact time directly.

**The held-out check** (`--lag 0.6`, eval/take-survey-heldout-2026-11-17.txt, the margin fixed beforehand): the same
24 builds at a wheel lag of 0.6 s.

| take | picks, ms | told every pick: sd, spin mean (worst) | with the margin: advised, sd, spin mean (worst) | step: sd, spin |
| --- | --- | --- | --- | --- |
| instant | 0, 0, 0, 0, 1, 2.5 | 0.20%, 0.39% (0.80) | 0 of 6, 0.12%, 0.15% (0.47) | 0.12%, 0.15% (0.47) |
| half-sine 3 ms | 0, 0, 1.5, 3, 3.5, 4 | 0.22%, 0.40% (1.06) | 1 of 6, 0.21%, 0.44% (1.09) | 0.22%, 0.39% (1.09) |
| half-sine 6 ms | 5.5, 6, 6, 6, 6, 6 | 0.21%, 0.76% (1.98) | 6 of 6, 0.21%, 0.76% (1.98) | 0.77%, 2.53% (4.87) |
| front 4 ms | 0, 1.5, 3, 3, 4, 4.5 | 0.39%, 1.30% (5.03) | 0 of 6, 0.39%, 0.59% (1.64) | 0.39%, 0.59% (1.64) |

The margin held. No instant build was advised, though two picked 1 and 2.5 ms and read worse when told. Every 6 ms
build was advised, and its scatter fell to about a quarter and its spin error to about a third. At this lag the
front-loaded take picked anywhere from 0 to 4.5 ms and would have read the spin worse told its pick (worst 5.03%). The
margin advised none of those builds, so here it saved a re-flash that would have hurt. A 3 ms take is too short to
matter at 0.6 s (0.22% as a step), and the survey mostly says so. One 6 ms ESC build told 5.5 ms read its scatter
better but its spin worse (0.77% to 1.98%), the one advised build where a re-flash cost something.

**What changes.** The firmware and the Pi now survey the contact time on every calibration drill (about 42 s longer for
12 balls), and the advice is conservative. Nothing changes until a person re-flashes `TAKE_US`. Next: trace the
first-order plant's lag-0.3 s preference for 2.5-3 ms on instant takes. Then time the survey on a real ESP32, and log
a real wheel's tach around one ball.

## The first-order take misfit traced (2026-11-18)

**The item.** On the first-order plant at a wheel lag of 0.3 s, all three builds with an instant take were advised a
2.5 ms contact time, and read worse told it (section above). The margin kept the advice from reaching a person, but
the cause was untraced. The guess was the simulator's 1 ms command steps against its 0.1 ms physics.

**Not the plant, not the fit's model.** `tests/take_misfit_trace.py` keeps every record fit's inputs from those
builds (calibration plus slow drill, lags 0.3 and 0.6 s) and refits them offline at the survey's seven contact
times, scored as the board scores them (eval/take-misfit-record-fits-2026-11-18.txt). Five of six builds picked 0 ms,
and the sixth's 2 ms won by 6 ppm (a lag-0.6 s build). Fixing tau at the plant's lag, moving every command 0.5 or 1 ms
either way, an exact exponential plant step in place of Euler, and a 0.02 ms Euler step: none moved a lag-0.3 s build
off 0 except one 0.02 ms build, which picked 2 ms by the same few ppm. The model and the simulator agree.

**The survey's own search.** Reproducing one build's survey drill gave the board's sums to the digit, and listing each
wheel's seven rms values showed the cause. Within one wheel most candidates fitted alike (25 ppm) but single candidates
jumped 3-12 times (to 118, 182, 204 ppm), always with the lag search ending at 277-330 ms instead of 300. Sweeping tau
on such a wheel shows cliffs: 227 ppm at 300 ms, 42 at 305. The t0 search's first grid, nine points over two to three
revolutions, sometimes lands in the wrong basin, the two finer levels refine around it, and the golden section on tau
follows the jagged curve. The survey sums squares, so the five wheels where the step's search missed (66-182 ppm against 9-57 for the rest)
outvoted the other 17, and 3 ms won. A fourth t0 level cured both wheels tried (32 and 23 ppm at 299.7 ms).

**The fix, tested on the board's own inputs.** Every take-survey wheel's inputs from 48 survey drills (the four takes,
two plants, three launchers, lags 0.3 and 0.6 s) were refit at 3, 4 and 5 t0 levels. The prediction, written first:
at 4 levels no instant build picks over 1 ms or is advised, and every 6 ms build is named within 1 ms and advised
(eval/take-misfit-survey-2026-11-18.txt):

| take (12 builds) | 3 levels (shipped): within 1 ms, advised | 4 levels | 5 levels |
| --- | --- | --- | --- |
| instant | 7, 0 | 11, 0 | 12, 0 |
| half-sine 3 ms | 9, 3 | 8, 4 | 10, 5 |
| half-sine 6 ms | 12, 10 | 12, 12 | 12, 12 |
| front 4 ms | 8, 5 | 10, 7 | 11, 7 |

Four levels missed by one build: a lag-0.3 s instant build picked 3 ms, tied with the step to the ppm and not
advised. Five levels met the prediction.

**Held out.** Five levels was picked after seeing that table, so the board now runs it and the 24 survey drills were
rerun at a wheel lag no run had used, 0.45 s, with the prediction written first: no instant build advised, every
instant pick 1 ms or less, every 6 ms build named and advised, no survey cut (eval/take-misfit-heldout-2026-11-18.txt):

| take (6 builds, lag 0.45 s) | 3 levels: picks, advised | 5 levels (the board): picks, advised |
| --- | --- | --- |
| instant | 0, 0, 0, 0, 1, 3; 0 | 0, 0, 0, 1, 1, 2.5; 0 |
| half-sine 3 ms | 0, 0, 1.5, 2.5, 2.5, 3.5; 1 | 3, 3, 3, 3, 3, 3; 3 |
| half-sine 6 ms | 5.5, 5.5, 6, 6, 6, 6.5; 4 | 6 on all six; 6 |
| front 4 ms | 4, 4, 4.5, 4.5, 4.5, 5.5; 5 | 4.5 on all six; 6 |

One part missed again: an instant build picked 2.5 ms, on a tie with the step (share 1.00), so not advised. A pick
whose share is 1.00 means nothing, and the advice already says "keep 0" for it. The rest held. The 3 ms take, which
the shipped survey named on half its builds, is now named on all of them, and every spread take on the held-out lag
is named to the half millisecond. No survey was cut.

**What changes.** `controller.TAKE_SURVEY_LEVELS = 5`: the take survey's refits search t0 five levels deep (60 steps a
fit, not 36). The record fit keeps 3, because its readings barely move (sd 0.12-0.16% on these builds, 0.13-0.16% with tau fixed at the truth). The
cost is board time on a calibration drill: about 10 s of control ticks a two-wheel ball, not 7, so `host.TAKE_WAIT_S`
went from 8 to 12 s and `TAKE_SURVEY_S` from 12 to 16 s. The calibration drill's holds came to 79 s for 12 balls
(42 s before).

**Not known.** All simulated, noise-free plants, one seed. The ESC-lag survey searches the same way (3 levels, and no
tau refinement). On these first-order builds it picked an 11-12 ms ESC lag where there is none, which may be the same
cliffs; not checked. A jittery tach blurs the cliffs and also sets its own floor, so how much depth helps on a real
board is open. Neither the 79 s on a real ESP32 nor its float speed is measured. Next: rerun the ESC-lag survey's
inputs at 4-5 levels, then time a survey on a real board.

## The ESC-lag survey's search, traced (2026-11-18)

**The item.** The section above ended on the ESC-lag survey: in the contact-time drills it refined to 10-14 ms on 9 of
12 first-order builds, where there is no ESC lag, and to 22-25 ms on all 12 builds with a 50 ms ESC
(eval/take-survey-sweep-2026-11-17.jsonl.gz, `esc_refined_ms`). A survey that names half the true lag is the case
"a wrong setting is much worse than none" warned about: told 20-50 ms, a first-order build read spin 41-44% off.

**Two suspects.** The survey fits t0 at the record fit's 3 levels, which is what broke the take survey. It also skips
the tau golden section (`refine=0`), so tau is tried only on `LOOP_TAU_GRID_US` (100 / 200 / 400 / 800 / 1600 ms).
`tests/esc_misfit_trace.py` keeps every surveyed wheel's inputs as the board passed them (its shipped refit gives the
board's rms on 528 of 528 wheels) and refits them under one change at a time. The prediction, written first: the ESC
lag stands in for the tau the grid cannot reach, so the golden section alone fixes it and depth alone does not
(eval/esc-misfit-trace-2026-11-18.txt; calibration drill, two takes, three launchers, lags 0.3 and 0.6 s):

| change (12 builds per plant) | first-order: picks, at 5 ms or less | ESC 50 ms: picks, within 10 ms |
| --- | --- | --- |
| shipped (3 levels, no refinement) | 0-14 ms, 6 | 23-25 ms, 0 |
| 5 t0 levels | 0-14 ms, 6 | 23-25 ms, 0 |
| refine 1 or 2 | 0, 12 | 34-83 ms, 2 |
| refine 3 | 0, 12 | 43-55 ms, 12 |
| refine 5 (the record fit's) | 0, 12 | 42-55 ms, 12 |
| tau fixed at the plant's (an oracle) | 0, 12 | 53-54 ms, 12 |

It held. The mean rms per lag shows why: on a first-order build at 0.3 s the unrefined fit missed by 540 ppm at 0 ms and
489 at 20 ms, so 20 ms won because it helped the tau grid's 200 or 400 ms imitate 300 ms. Refined, 0 ms misses by 64
and every other lag by 400 or more. The survey's first check (section "The ESC lag surveyed on the board") never saw
this because its wheel lags, 0.2 / 0.4 / 0.8 s, all sit on the tau grid.

**Held out.** The board now runs `controller.ESC_SURVEY_REFINE = 5`, the pre-registered change (refine 3 also passed,
but it was chosen after seeing the table). The calibration drill was rerun at lags no part 1 run used: 0.45 s on both
plants, the jittery tach plant (3 us, 10k) at 0.3 and 0.45 s, and on-grid 0.4 s, the case that must not regress. The
prediction: every first-order build 5 ms or less, every 50 ms build 40-60 ms, every wheel counted, nothing cut.

**The cost broke the count, and the venture's tests caught it.** Each refit is now 36 steps, not 15, so a two-wheel
ball's survey takes about 4.3 s of control ticks instead of 1.8 s. A new stroke used to cut the last ball's survey, and
on drills with no hold it now cut nearly all of them: 11 of 22 wheels on the calibration drill with the take survey off,
4 of 32 on the rally drill. The flow "run a drill, then the calibration drill is held until the board is told the lag"
(section "Checked before a calibration drill") needs 16, so three of its tests failed. A cheaper search was tried first:
golden section alone in a bracket around the record fit's tau, at the old 15 steps. It failed: with the ESC untold, the
record's tau is 1.2-1.9 times the wheel's true lag, the candidates' best taus all sit near the true one, and an 80 ms
ESC read 13-57 ms depending on the bracket. What shipped instead:

- a new stroke pauses a survey rather than cutting it: no survey step runs while a stroke is under way or a record's
  fit is pending, so the stroke's control ticks cost what they did;
- surveys queue behind the one running (`controller.SURVEY_QUEUE = 2`, two balls' snapshots and tick logs, kept small
  for the ESP32's heap; the oldest waiting one gives way and counts as `survey_cut`). On the rally drill, depth 2
  surveyed 18-20 of 32 wheels, 3 got 20-22 and 4 got 22-24;
- the Pi's wait at a drill's end drains the queue: `host.ESC_SURVEY_S` 4 s to 20 s, ending once no count has risen for
  `host.SURVEY_QUIET_S` = 3 s (it was 0.5 s, shorter than one wheel's survey, so it used to stop before the last ball's).

Rerun with all of that (eval/esc-misfit-heldout-2026-11-18.txt):

| builds (calibration drill) | picks | wheels counted |
| --- | --- | --- |
| first-order, 0.4 and 0.45 s, no hold (12) | 0 on all | 18-20 of 24 |
| jittery tach, 0.3 and 0.45 s, no hold (12) | 0 on all | 18-20 of 24 |
| ESC 50 ms, 0.4 and 0.45 s, no hold (12) | 47-54 ms | 18-20 of 24 |
| 0.45 s with the take survey on, as `tennisbots run` runs it (12) | 0 / 50-55 ms | 24 of 24, none cut |

The picks held on 36 of 36. Without a hold, 2-3 queued surveys a drill gave way, so the "every wheel" half missed there,
but each drill kept at least 18 wheels, above the 16 the advice needs. Run as a real calibration drill, 12 of 12 met all
of it; the take survey's holds came to 104-107 s for 12 balls (79 s before), under the 12 s cap a ball.

**Drills without a hold.** On the rally and example drills (`--rally`) the old survey picked 83-86 ms for the 50 ms ESC,
so it was wrong there as well. Now it picks 49-51 ms from 6-18 wheels. One build outside every run above is still off:
an untold 150 ms ESC on a 0.6 s wheel read 188 ms on the rally drill, 25% over (150 sits between the grid's 100 and 200).

**Not known.** All simulated, one seed, one ESC shape (a first-order lag). The 4.3 s of survey a ball, two queued
balls' memory and a drill end that can now wait up to 20 s have not been tried on a real ESP32. Next: time a survey and
measure free heap with two queued on a real board; a grid point between 100 and 200 ms if a real ESC lands there.

## The ESC-lag survey between 100 and 200 ms (2026-11-18, after the trace)

**The item.** The section above left one build off: an untold 150 ms ESC on a 0.6 s wheel read 188 ms on the rally
drill. 150 sits between `ESC_SURVEY_GRID_US`'s 100 and 200 ms, and `survey_pick` refines the least grid lag with a
parabola in the lag's log. Either the grid is too coarse there or the parabola's axis is wrong.

**How.** `tests/esc_grid_gap.py` runs drills with an untold ESC (the board at `ESC_TAU_US` 0, as before any survey),
keeps every surveyed wheel's inputs as the board passed them, and refits each one offline at 15 lags (0-400 ms), as the
board refits (`ESC_SURVEY_REFINE` 5). Any grid that is a subset of those 15, with either axis, can then be scored
without another drill. Part 1: ESC 0 / 50 / 80 / 120 / 150 / 180 / 250 / 300 ms, wheel lags 0.3 / 0.45 / 0.6 s, the rally,
example and calibration drills, 72 drills. The prediction, written first: the grid is the cause, not the axis. Scored
on the 48 drills with at least 16 surveyed wheels (the Pi advises only those), against a bar of first-order 5 ms or less
and an ESC within 10% (eval/esc-grid-gap-2026-11-18.txt):

| grid | lags | drills within the bar | 150 ms ESC, counted drills |
| --- | --- | --- | --- |
| shipped, log axis | 6 | 26 of 48 | 152-195; 5 of 6 over by 13-30% |
| shipped, linear axis | 6 | 8 of 48 | 179-245; and 50 ms read 63-67 |
| + 150 ms | 7 | 34 of 48 | 148-155, 6 of 6 |
| + 150 and 300 ms | 8 | 36 of 48 | 148-155, 6 of 6 |

The grid was the cause at 150 ms, and the log axis is right. But no grid met the bar everywhere: on slow wheels a long
ESC fits almost as well at any lag from 100 to 400 ms (a 180 ms ESC on a 0.6 s wheel, calibration drill: 53-63 ppm
across that span). The ESC and the wheel are two lags in series, and when the ESC's is a third of the wheel's or more,
a drill's balls barely tell them apart. 250-300 ms builds picked 400 or 266-282.

**A band, tried and held out.** Designed on part 1's drills: call the pick unsure when the grid lags within 15% of the
least mean rms reach the grid's end, run from 0 past 20 ms, or span more than a factor of 2, and advise no number then.
On part 1 that flagged 13 drills, all with an ESC of 180 ms or more, and 34 of the other 35 came within 15%. Held out
on 24 drills no part 1 run used (ESC 0 / 35 / 65 / 130 / 165 / 210 ms, wheel lags 0.35 and 0.5 s, seed 8, another true
launcher), the prediction was that every build of 130 ms or less is sure and every sure build is within 15%:

| held out (24 drills, all counted) | shipped grid | + 150 ms | band on + 150 |
| --- | --- | --- | --- |
| 0-130 ms (16 drills) | 16 within 15% | 16 within 15% | all 16 sure |
| 165 ms (4) | 1 | 2 | 4 sure; 2 missed (119 and 218 ms) |
| 210 ms (4) | 1 | 1 | 2 unsure (400); 1 sure miss (167) |

The band failed (3 sure builds missed by 20-32%), so it is not in the Pi. The pre-registered fallback held: the 7-lag
grid missed no build the shipped grid hit (19 of 24 to 18). The board now surveys at 0 / 20 / 50 / 100 / 150 / 200 / 400
ms, and the ESC_SURVEY frame carries seven rms slots (`protocol.ESC_SURVEY_LAGS` 7): a Pi and a board from either side
of this change do not read each other's frame, so update both.

**The cost.** One more refit a wheel, about 17% more survey time a ball. Rerun on the 7-lag board (0 / 50 / 150 ms at
0.3 and 0.6 s, rally and calibration drills): every pick right (0; 48-52; 149-157), but the queued surveys reached
16-18 wheels where the 6-lag board reached 18-22. That is the 16 the Pi needs to advise, with nothing to spare. The
venture's tests of the "run a drill, then the calibration drill is held" flow pass.

**Not known.** All simulated, one ESC shape (a first-order lag). Above about 165 ms on a slow wheel the survey's pick
is not reliable, and nothing yet tells the Pi when it is in that range: log a real ESC's step response on a scope. Next:
a real ESC's lag; whether `SURVEY_QUEUE` 3 fits the ESP32's heap, to win back the wheels the seventh lag costs.

## Long ESC lags: the survey read too little of the recovery (2026-11-18, after the grid)

**The item.** The section above ended with no flag the Pi could trust: above about 165 ms on a slow wheel the survey's
pick was 20-30% off while it looked sure, and a band on the per-lag rms failed held out.

**Noise or bias?** A flag built on the survey's own spread can only catch noise. Split in halves (odd and even wheels,
or first and second half of the drill), the stored drills of `tests/esc_grid_gap.py` answered: the worst sure misses
had halves that agreed on the wrong lag (165 ms at 0.35 s on the calibration drill: 117 / 121, read 119; 165 ms at
0.5 s: 210 / 222, read 218). The misses were a bias, so no spread flag would have caught them, and the curves showed a
second clue: a single wheel's best lag ranged from 35 to 400 ms on the same drill.

**The window.** Each survey refit reads `drop_from_commands_steps`' default window, 4 revolutions before the ball's
anchor and 8 after: about 0.16 s at 3,000 rpm, where the wheel's own lag is 0.3-0.6 s and a long ESC's 0.15-0.25 s.
Two lags in series barely differ over the start of a recovery. The launched stroke's snapshot already runs to the
verdict and holds 28-118 revolutions, so the board was throwing away most of what it had logged.

`tests/esc_survey_window.py` captures drills with an untold ESC, keeps every surveyed wheel's inputs as the board passed
them, and refits each wheel offline at the board's grid and refinement with 8, 12, 16 and 24 revolutions after the
anchor, scored by the board's own sums and pick (eval/esc-survey-window-2026-11-18.txt). Design drills: ESC 0 / 50 / 120
/ 165 / 180 / 210 / 250 ms, wheel lags 0.35 / 0.5 / 0.6 s, rally and calibration drills, seed 7:

| window (revolutions after the anchor) | 42 design drills within 15% | of them ESC 165 ms or more (24) |
| --- | --- | --- |
| 8 (the board's) | 31 | 13 |
| 12 | 41 | 23 |
| 16 | 42 | 24 |
| 24 | 42 | 24 |

**Held out.** The prediction and decision rule were committed before the held-out capture ran (commit 3893f7c26): on
ESC 0 / 40 / 90 / 140 / 175 / 195 / 230 ms, wheel lags 0.4 and 0.55 s, seed 11 and the third true launcher (28 drills),
16 revolutions would put every counted drill within 15% (first-order 5 ms or less), and 8 would miss at least 3 of
the 12 drills of 175 ms or more. It held: 16 put 28 of 28 within 15% (175 ms read 168-179, 195 ms 202-208, 230 ms
247-249); 8 put 21, missing 6 of those 12 and one 140 ms drill (read 113).

**What shipped.** The board's survey refits read `controller.ESC_SURVEY_AFTER = 16`. The record's own drop fit keeps
8. With it the Pi's advice changes in one place: a pick at the grid's last lag (400 ms) only says the lag is long, so
`esc_survey_advice` tells the builder to scope the ESC rather than set 400, and `esc_lag_check` does not hold a
calibration drill on it. `tests/test_host.py` checks an untold 180 ms ESC on a 0.35 s wheel (106 ms with 8; 182 now).

**The cost.** A refit has as many rows as revolutions in its window, 13 before and 21 now, so each of its 36 steps does
about 1.6 times the arithmetic. The simulator gives every step one control tick, so its wheel counts did not move
(16-18 a drill); on a real ESP32 a step that outlasts its tick would delay the survey, not the strokes, and time a
survey there before trusting the count. Short lags now read a little low (40 ms: 35-37, 50 ms: 44-47, all within
15%), and 250 ms reads 265-275, where the grid has nothing between 200 and 400.

**Not known.** All simulated: a first-order ESC behind a first-order wheel, one seed per set. A real ESC's step
response may not be one lag. Next: time a 16-revolution refit step on a real ESP32; a real ESC's lag on a scope;
whether the record's own fit (window 8) reads the drop better with a longer window on slow wheels.

## The record's drop fit and its window (2026-11-18, after "Long ESC lags")

**The item.** The section above moved the survey's refits to 16 revolutions after the ball's anchor and left the
record's own drop fit, the reading the Pi's launcher fit is built on, at `drop_from_commands_steps`' default of 8. Does
that reading get better with a longer window on slow wheels (0.35-0.6 s)? The record fit is told the ESC lag, so it
does not have the survey's problem of telling two lags in series apart; what a longer window could buy is more rows
against the same unknowns, and what it could cost is more of whatever the model gets wrong.

`tests/record_fit_window.py` runs the calibration drill and min_fit_heldout's slow drill per build, keeps every board
record fit's inputs (snapshot periods, ESC-lagged ticks) with the simulator's true drop, and refits each offline with
8, 12, 16 and 24 revolutions after the anchor (eval/record-fit-window-2026-11-18.txt; wheels at 1,000 rpm and up).
The captured inputs (5.6 MB compressed) are not kept: the capture is seeded and reruns in about 6 minutes on 4 cores. Design builds: first-order, tach 3 us
jitter, ESC 50 ms told and ESC 150 ms told, wheel lags 0.35 and 0.6 s, seed 7, launcher 0, 513 fits. rms is reading /
true drop about 1, bias included:

| build | after 8 | 12 | 16 | 24 |
| --- | --- | --- | --- | --- |
| first-order, 0.35 s | 0.20% | 0.28% | 0.30% | 0.29% |
| first-order, 0.6 s | 0.14% | 0.13% | 0.15% | 0.16% |
| tach 3 us, 0.35 s | 0.80% (worst 2.64%) | 0.73% | 0.68% | 0.61% (worst 1.48%) |
| tach 3 us, 0.6 s | 0.67% (worst 2.04%) | 0.67% | 0.64% | 0.59% (worst 1.58%) |
| ESC 50 ms, 0.35 / 0.6 s | 0.17% / 0.14% | 0.16% / 0.13% | 0.19% / 0.13% | 0.19% / 0.13% |
| ESC 150 ms, 0.35 / 0.6 s | 0.15% / 0.11% | 0.14% / 0.10% | 0.16% / 0.11% | 0.16% / 0.12% |
| all 513 | 0.39% (58 over 0.5%) | 0.38% | 0.36% | 0.34% (63 over 0.5%) |

So the slow wheel itself is not the record fit's problem: on the noise-free plants 8 revolutions are as good as any
longer window, and on the first-order 0.35 s build worse is longer (0.20% to 0.29-0.30%). What a longer window does is
average a jittery tach: 0.80% to 0.61% and the worst wheel 2.64% to 1.48%. The jittery-tach wheels are the noisiest
class the record fit has (README "Unsure marks on the noisy wheels"), and a real Hall tach will have some jitter.

**Pre-registration** (written before the held-out capture ran). Candidate: `after=24` for the record's fit (the
largest design gain; 12 and 16 gain less on the jitter builds and lose as much on first-order 0.35 s). Held-out
builds: first-order, tach 3 us, ESC 100 ms told and ESC 120 ms told with tach 3 us jitter, wheel lags 0.45 and 0.55 s,
seed 11, launcher 2 (8 builds). PREDICTION: with 24, rms falls on every held-out build with tach jitter (4 builds), by
at least 10% of its value at 8 on the pooled jitter builds, and the worst jitter wheel is lower; on the noise-free
builds rms moves by 0.10 points or less either way. DECISION RULE: the record's fit reads 24 (a new
`controller.LOOP_FIT_AFTER`) only if (a) pooled rms over all held-out fits is lower with 24 than with 8, (b) the
pooled jitter builds' rms falls by at least 10%, and (c) no held-out build's rms rises by more than 0.10 points.
Otherwise it keeps 8 and this section reports the miss.

**Held out** (run after the pre-registration was committed, 12ed51ffe; 514 fits):

| build | after 8 | 12 | 16 | 24 |
| --- | --- | --- | --- | --- |
| first-order, 0.45 / 0.55 s | 0.17% / 0.16% | 0.17% / 0.15% | 0.19% / 0.16% | 0.18% / 0.15% |
| tach 3 us, 0.45 s | 0.69% (worst 2.49%) | 0.62% | 0.64% | 0.54% (worst 1.79%) |
| tach 3 us, 0.55 s | 0.68% (worst 2.01%) | 0.62% | 0.60% | 0.54% (worst 1.18%) |
| ESC 100 ms told, 0.45 / 0.55 s | 0.15% / 0.15% | 0.14% / 0.14% | 0.15% / 0.15% | 0.16% / 0.14% |
| ESC 120 ms + tach 3 us, 0.45 s | 0.54% | 0.39% | 0.39% | 0.37% |
| ESC 120 ms + tach 3 us, 0.55 s | 0.55% (worst 2.26%) | 0.45% | 0.43% | 0.41% (worst 1.12%) |
| all 514 | 0.45% (90 over 0.5%) | 0.39% (74) | 0.39% (73) | 0.35% (70) |

It held on every clause: (a) pooled rms 0.45% to 0.35%; (b) the four jitter builds pooled (257 fits) 0.62% to 0.47%,
24% lower, each of them lower, the worst jitter wheel 2.49% to 1.79%; (c) the largest rise on any build was 0.01
points. The design's first-order 0.35 s loss (0.20% to 0.29%) did not recur at 0.45 s, so it reads as that build's
own, not a cost of the window on noise-free wheels in general.

**What shipped.** `controller.LOOP_FIT_AFTER = 24`, passed by `LaunchCheck._loop_fit`; `drop_from_commands_steps`
keeps its default of 8 for every other caller. The take survey (`TAKE_SURVEY_LEVELS`) still reads 8: its picks were
measured with 8 and are not retested here. `tests/test_host.py` checks a 4,500 rpm wheel with a 3 us edge timer reads
closer with 24 than with 8 (rms 0.51% to 0.44% over 24 ball moments).

**The cost.** A record fit has about 29 rows instead of 13, so each of its ~36 steps does about 2.2 times the
arithmetic; on the simulator each step is one control tick, so nothing moved. On a real ESP32 a step that outlasts
its tick delays the record's re-send, not the stroke; time it there with the survey's 16-revolution step (the section
above) before trusting either. When the snapshot is shorter than 24 revolutions after the ball (23-119 here) the
window stops at its end, as before.

**Not known.** All simulated, one seed per set: a first-order wheel, a first-order ESC and the simulator's Gaussian
edge jitter. A real Hall tach's jitter may be larger, or correlated with the wheel's angle (a magnet's position),
which averaging over more revolutions would not remove. Next: whether the take survey gains the same with 24, and a
real tach's edge jitter logged on a spinning wheel.

## The take survey's window (2026-11-18, after "The record's drop fit and its window")

**The item.** The section above moved the record's drop fit to 24 revolutions after the ball's anchor, because on a
jittery tach more rows averaged the edge noise. The take survey (`LaunchCheck._take_survey`) still refits at 8, and
every take-survey measurement so far ran on noise-free plants. Does it gain the same? Two pulls: more rows average the
jitter, but the take's effect sits in the first revolutions after the ball, so rows where every candidate fits alike
pull each candidate's rms toward the others' and the best / step share toward 1, which the advice's margin
(`host.TAKE_ADVISE_RATIO`, 0.6) reads as "keep 0".

`tests/take_survey_window.py` keeps every take-survey wheel's inputs as the board passed them
(`take_misfit_trace.capture_survey`) and refits each one offline at the board's grid and depth with 8, 12, 16 and 24
revolutions after the anchor, scored by the board's own trimmed sums, refinement and margin. For the first time it
includes the jittery tach plant (min_fit_heldout's "tach 3 us 10k"). Design: four takes (instant, half-sine 3 and 6
ms, front-loaded 4 ms) x first-order 8k, tach 3 us, ESC 50 ms told x three launchers, wheel lag 0.3 s, seed 7 (36
survey drills, eval/take-survey-window-2026-11-18.txt):

| window | spread takes named within 1 ms and advised (of 27) | instant builds advised (of 9) | picks within 1 ms (of 36) | mean best / step share: first-order, tach 3 us, ESC 50 ms |
| --- | --- | --- | --- | --- |
| 8 (the board's) | 12 | 0 | 31 | 0.68, 0.96, 0.42 |
| 12 | 9 | 0 | 30 | 0.67, 0.97, 0.53 |
| 16 | 7 | 0 | 29 | 0.69, 0.97, 0.62 |
| 24 | 7 | 0 | 31 | 0.69, 0.98, 0.66 |

The longer window dilutes the survey, as the second pull said: the ESC 50 ms 3 ms builds were advised at 8 (shares
0.50-0.57) and at none of 12-24 (0.63-0.84), with the picks still right. And the jitter is not rescued at any window:
on the tach 3 us plant no build was advised (shares 0.84-1.00), and all three 6 ms builds picked 8 ms, the grid's
last time, at every window.

**Pre-registration** (written before the held-out capture ran). Candidate: keep 8. Held out: the same 36 builds at
wheel lag 0.45 s, seed 11. PREDICTION: (a) spread takes named within 1 ms and advised are at least as many with 8 as
with 24, (b) the ESC 50 ms plant's mean share on spread takes is higher with 24 than with 8, (c) on the tach 3 us
plant no build is advised at any window, and (d) no instant build is advised at any window. DECISION RULE: the take
survey keeps `drop_from_commands_steps`' default of 8 unless 24 names and advises more spread builds than 8 on the
held-out set with no instant build advised; then this section reports the miss and 24 is retested on a third set.

**Held out** (run after the pre-registration was committed, 2b34515df; 36 survey drills, none aborted):

| window | spread takes named within 1 ms and advised (of 27) | instant builds advised (of 9) | picks within 1 ms (of 36) | mean best / step share: first-order, tach 3 us, ESC 50 ms |
| --- | --- | --- | --- | --- |
| 8 (the board's) | 12 | 0 | 32 | 0.54, 0.96, 0.47 |
| 12 | 11 | 0 | 29 | 0.56, 0.97, 0.53 |
| 16 | 9 | 0 | 30 | 0.58, 0.97, 0.59 |
| 24 | 9 | 0 | 30 | 0.59, 0.97, 0.63 |

Every clause held: (a) 12 named and advised with 8 against 9 with 24; (b) the ESC 50 ms plant's share rose from 0.47
to 0.63 (its 3 ms builds were advised 2 of 3 at 8 and 0 of 3 at 16 or 24); (c) no tach 3 us build was advised at any
window (shares 0.90-1.00); (d) no instant build was advised. The design run's 6 ms jitter builds all picked 8 ms, but
the held-out ones picked 5.5-6 ms, so that bias belongs to the 0.3 s lag. The jitter plant's picks scatter (an
instant take read 0 to 5.5 ms, a 3 ms take 0 to 3.5), and its share keeps the advice at "keep 0" every time.

**What shipped.** The take survey keeps a window of 8, now named `controller.TAKE_SURVEY_AFTER` and passed explicitly,
so a later change to the default cannot move it unnoticed. The record fit keeps 24. The two fits want different
windows because they ask different questions: the record fit's reading gains from averaging, while the survey's
choice between contact times lives in the rows right after the ball.

**What this says about a real board.** At a 3 us edge jitter the survey cannot see a 3-6 ms contact time at all. Its
shares sit at 0.90-1.00 at every window, and the margin keeps it quiet, as it should. So on a real wheel the survey
only speaks if the tach is much cleaner than 3 us. A logged tach on a spinning wheel answers this first. If the jitter
is that large, a quieter edge (a debounced Hall sensor, or a timer capture in place of the pin interrupt) is worth more
than any fit change.

**Not known.** All simulated, one seed per set, Gaussian edge jitter, an assumed take profile. Next: the jitter level at
which the take survey goes blind (a sweep of `tach_jitter_us` from 0.5 to 3 us; the next section), then a real tach's
edge jitter.

## The take survey's jitter limit (2026-11-18, after "The take survey's window")

**The item.** The section above found the survey blind at 3 us of edge jitter and useful with none, and nothing in
between was measured. A builder who logs a real tach and reads 1.2 us cannot tell whether the survey will speak.
`tests/take_survey_jitter.py` runs the same survey drill (the calibration drill with `SURVEY_TAKE` on, the board's grid,
depth and window of 8) on min_fit_heldout's "tach 3 us 10k" plant with its jitter set to 0, 0.5, 1, 1.5, 2 and 3 us
(10,000 rpm wheels throughout, so 0 us is that plant without its noise), the four takes and three launchers: 72 survey
drills a set, scored by the board's own sums and margin. The simulator rounds each jittered edge to a whole
microsecond, as `ticks_us()` does. Design: wheel lag 0.3 s, seed 7 (eval/take-survey-jitter-2026-11-18.txt):

| edge jitter | spread takes named within 1 ms and advised (of 9) | instant builds advised (of 3) | picks within 1 ms (of 12) | mean best / step share, spread takes |
| --- | --- | --- | --- | --- |
| 0 us | 6 | 0 | 10 | 0.55 |
| 0.5 us | 3 | 0 | 12 | 0.69 |
| 1 us | 1 | 0 | 11 | 0.86 |
| 1.5 us | 0 | 0 | 10 | 0.91 |
| 2 us | 0 | 0 | 10 | 0.91 |
| 3 us | 0 | 0 | 7 | 0.96 |

The survey fades fast: half a microsecond already halves what it advises (the 6 ms takes stay advised at shares
0.36-0.49; the front-loaded 4 ms ones drop out), at 1 us only one 6 ms build is advised (0.59, just inside the 0.6
margin), and from 1.5 us nothing is. The picks themselves stay mostly right up to 2 us (10 of 12 within 1 ms); it is the
margin that goes, as it should when every candidate's rms sinks into the same noise floor. No instant build was advised
at any jitter, so the margin's quiet is safe: a noisy tach costs the survey its voice, not a wrong re-flash.

**Pre-registration** (written before the held-out capture ran). Held out: the same 72 builds at wheel lag 0.45 s, seed
11. PREDICTION: (a) no spread take is named and advised at 1.5, 2 or 3 us; (b) the count named and advised does not
rise from one jitter to the next across 0, 0.5, 1 and 1.5 us; (c) the mean share on spread takes is higher at 1.5 us
than at 0 us by at least 0.2; (d) no instant build is advised at any jitter. DECISION RULE: if (a) and (d) hold, the
README and `tennisbots tach-jitter` state the survey's limit as "speaks below about 1 us, blind from 1.5 us"; if (a)
fails, the limit is moved to the lowest jitter with no build advised on either set and the miss is reported here.

**Held out** (run after the pre-registration was committed, 9e4cc316f; 72 survey drills, none aborted):

| edge jitter | spread takes named within 1 ms and advised (of 9) | instant builds advised (of 3) | picks within 1 ms (of 12) | mean best / step share, spread takes |
| --- | --- | --- | --- | --- |
| 0 us | 8 | 0 | 10 | 0.45 |
| 0.5 us | 1 | 0 | 10 | 0.80 |
| 1 us | 0 | 0 | 12 | 0.85 |
| 1.5 us | 0 | 0 | 12 | 0.92 |
| 2 us | 0 | 0 | 8 | 0.93 |
| 3 us | 0 | 0 | 8 | 0.96 |

Every clause held: (a) nothing advised at 1.5, 2 or 3 us; (b) 8, 1, 0, 0 across 0 to 1.5 us; (c) the share rose from
0.45 to 0.92; (d) no instant build advised. The held-out set is harsher than the design set at 0.5 us (1 of 9 against
3), so across both sets the survey named and advised 14 of 18 spread takes on a clean tach, 4 of 18 at 0.5 us, 1 of 18
at 1 us and 0 of 54 from 1.5 us. The picks stay mostly right through 1.5 us (22 of 24 within 1 ms on both sets); what
the jitter takes away is the margin, so the survey goes quiet rather than wrong. The pre-registered limit ("speaks below
about 1 us") was too generous for the held-out set; the shipped bands below put the edge at the clean tach instead, a
choice made after seeing the held-out numbers.

**What shipped.** `tennisbots tach-jitter periods.txt` (src/tennisbots/tach.py) reads a steady wheel's logged periods
and prints the tach's edge jitter and where the survey stands at it. The estimate is the variance of the periods' second
differences (the edge times' third differences, 20 times an edge's variance for independent edge errors), which a
steady speed-up or slow-down cancels; a missed or doubled pulse is dropped and gross outliers are cut first. It reads the
board's whole-microsecond clock too: simulator-like edges at 0, 0.5, 1, 1.5, 2 and 3 us read 0.40, 0.69, 1.14, 1.59,
2.09 and 3.09 us, so a perfect sensor still reads about 0.4. Bands, on that scale: under 0.55 us the survey can name a
spread take; 0.55-1.35 it is near its limit and a "keep TAKE_US = 0" may only mean it cannot see; from 1.35 it cannot
see a 3-6 ms contact time. `firmware/esp32/tach_log.py` logs the periods from the REPL (a hard interrupt into a buffer
made beforehand, as `main.Tach` times them): `import tach_log; tach_log.run(34, 600)` with the wheel spinning steadily
and no ball in the feeder. `tests/test_tach.py` checks the estimate recovers 0.5-5 us within 12% through whole-us
rounding, ignores a 300 rpm/s drill-like wander, and drops a missed pulse.

**Not known.** All simulated: Gaussian, independent edge errors, one seed per set, an assumed take profile. A real
sensor's errors may be tied to the wheel's angle (a reflective mark's edge, a magnet's position) or arrive in bursts
(an ESC's switching noise on the lead), which the second difference reads as jitter too, though their effect on the
survey may differ. Next: a real tach logged with tach_log.py on a spinning wheel; if it reads 1.35 us or more, a timer
capture (the ESP32's MCPWM capture unit timestamps an edge in hardware) in place of the pin interrupt, measured with the
same command.

## A tach timed in hardware (2026-11-18, after "The take survey's jitter limit"; built, off by default)

**The item.** The section above found the contact-time survey blind from 1.5 us of edge jitter, and named the fix to
try if a real tach reads that much: a timer capture in place of the pin interrupt. The interrupt reads `ticks_us()`
when its handler runs, so each edge time carries the handler's latency and its spread (a flash cache miss, another
interrupt). The ESP32's MCPWM capture unit latches a free-running 80 MHz counter on the edge itself; the handler only
has to read the latched value before the next edge (6 ms at 10,000 rpm).

**What shipped.** `capture.py` routes a pin to MCPWM0's capture channel through the GPIO matrix, rising edges, no
prescale, and reads the latched value. Every address and bit is from Espressif's register headers for the ESP32
(esp-idf v5.2.2, listed at the top of the file), not from memory: two offsets this run first wrote down from memory
were wrong (the capture input's signal index is 109, not 41). MicroPython's `machine.PWM` uses the LEDC peripheral, so
MCPWM0 is free. The tick difference is a viper function: the counter passes 2^30 every 13 s and MicroPython's small
ints stop there, so plain Python would build a big int inside the hard interrupt, which may not allocate.
`controller.CaptureClock` turns ticks into the whole-microsecond periods `PeriodTach` takes, carrying the remainder so
the periods add up to the edge times and never drift; a gap over the stall time on either clock (the counter wraps
every 53.7 s, so only `ticks_us()` can tell a long stop from a short one) restarts the tach. `config.TACH_CAPTURE`
turns it on for both launcher tachs (top on channel 0, bottom on 1); it is **False**, because none of this has run on
a board. `tach_log.run(34, 600, capture=True)` logs a wheel's periods the same way, so a builder can log one steady
wheel both ways and read each with `tennisbots tach-jitter`, which now says to do exactly that when a log reads 0.55 us
or more.

**On the simulator.** `tests/feeder_sim.py` runs `capture.py` itself against a stand-in register file: on each edge it
writes the true edge time, in 80 MHz ticks, to the capture register before calling the handler, and its
`tach_jitter_us` now moves only the handler's read. `tach_sensor_jitter_us` moves the edge itself, which the capture
cannot help. `tests/test_capture.py` checks the register writes, the counter's wrap and the too-long gap, the carry, and
on the drill: a 3 us handler jitter reads 3.22 us by the interrupt and 0.40 us by the capture (a clean tach reads 0.42),
while 2 us of sensor jitter still reads over 1.6 us through the capture. The survey drills of the section above, rerun
with the capture (`tests/take_survey_jitter.py --tach-capture`; eval/take-survey-capture-2026-11-18.txt, pre-registered
before the held-out set ran, every clause held):

| handler jitter | interrupt: spread takes named and advised (of 18, both sets) | capture: the same (of 18) | capture: instant builds advised (of 6) |
| --- | --- | --- | --- |
| 0 us | 14 | 11 | 0 |
| 0.5 us | 4 | 11 | 0 |
| 1 us | 1 | 10 | 0 |
| 1.5 us | 0 | 11 | 0 |
| 2 us | 0 | 12 | 0 |
| 3 us | 0 | 13 | 0 |

The capture holds the survey where it is on a clean tach at every jitter: 36 of 54 from 1.5 us against 0 of 54. At
0 us it advised 11 to the interrupt's 14; both floor the same edges to whole microseconds, on grids shifted by the
first edge's phase, and the drills drift apart from the third shot (104 of 1,640 periods differ by more than 1 us on
the example drill), so that is one draw per set rather than a measured cost. By construction the simulator's handler
jitter cannot reach a capture's periods; what these runs check is the code path (the real `capture.py`, `Tach` and
`CaptureClock` through the whole drill) and that nothing else in the drill leans on the handler's timing.

**Not known.** Whether a real board's jitter is the handler's or the sensor's: that is what logging both ways tells.
The viper function, the register writes and the GPIO matrix routing have not run on a board; bench it with the wheels off before turning it on. Next:
the capture's 12.5 ns resolution is floored to whole microseconds for `PeriodTach`; periods in finer units would lower
the clean tach's 0.4 us floor, and might lift the clean row's 11-14 of 18.

## Periods finer than a microsecond (2026-11-18, after "A tach timed in hardware"; built, kept at 1 by its pre-registered rule)

**The item.** The capture latches an 80 MHz counter, 12.5 ns a tick, but `CaptureClock` floored its periods to whole
microseconds for `PeriodTach`, putting back an error of up to 1 us on every edge (0.29 us standard deviation). The
section above guessed that finer periods would lower the clean tach's 0.4 us reading and might lift the clean row's
11-14 of 18 spread takes named.

**What shipped.** `PeriodTach(sub=N)` and `CaptureClock(sub=N)` keep periods in units of 1 / N us (N divides 80).
Everything the interrupt touches stays a small int (a 250 ms stall at N = 80 is 2e7, under MicroPython's 2^30);
`recent()` hands the drop fits microseconds, and `rpm()` / `rpm_last()` still take microseconds. `config.TACH_CAPTURE_SUB`
sets it for the board's capture tachs, `tach_log.run(34, 600, capture=True, sub=8)` logs fractional microseconds, and
`tennisbots tach-jitter` now keeps the fractions it reads (it used to truncate them). At N = 1 every path is bit-identical
to before: the held-out survey rerun through the new code at sub 1 reads exactly the earlier file's 7, 7, 6, 7, 8, 8.

**The jitter reading.** On the example drill the capture's edge jitter reads 0.40 us at whole microseconds and 0.26 us at
1/8 us (`tests/test_capture.py`); the difference in quadrature is 0.29 us, the floor's own error to within 0.05. What is
left is the drill's real wheel motion between revolutions. A builder logging a steady wheel at sub 8 sees the sensor
without the clock in the way; the advice bands in `tennisbots tach-jitter` were set at whole microseconds, so read them
from a sub-1 log.

**The survey: failed held out.** `tests/take_survey_jitter.py --tach-capture --sub 8`, pre-registered before the held-out
set ran (eval/take-survey-capture-sub8-2026-11-18.txt):

| set | whole us: spread takes named and advised (of 54) | 1/8 us: the same | 1/8 us: instant builds advised (of 18) |
| --- | --- | --- | --- |
| design (lag 0.3 s, seed 7) | 25 | 45 | 0 |
| held out (lag 0.45 s, seed 11) | 43 | 14 | 1 |

Every clause failed held out, an instant build was advised, and by the rule `TACH_CAPTURE_SUB` is 1. The six jitter
columns of a capture run are near-repeats of one plant (the handler's jitter cannot reach the periods), so each set is
about one draw: the design set's gain and the held-out set's loss are both that size.

**Why, as far as traced.** Not the fit's window: `controller._anchor` picks the same slowest revolution on 21 of 22
wheels at either unit (`tests/take_survey_sub_anchor.py`). What the per-wheel rows show is that several take candidates
reach the identical residual to four digits, 0 ms and 6 ms alike, and the rest jump above it by amounts that do not
follow the candidate. At whole microseconds the floor's error lifts every candidate to a common level and the jumps are
small beside it; at 1/8 us that level falls 2-4 times and the jumps decide the sum. So the survey's verdicts have been
trimmed sums of mostly take-blind rows, and how much of its 43 of 54 the take itself earned is open. Next: why the
residual is identical across candidates (does the fit's t0 land where all of the take's parts fall in one revolution,
or do the take columns drop out of the solve), on these 22 wheels.

## Take-blind rows traced (2026-11-18, after "Periods finer than a microsecond"; the take survey's trim off, sub 8 on)

**The item.** The section above ended on an open question: on the take survey's wheels several contact-time
candidates reach the identical residual, 0 ms and 6 ms alike, and at 1/8 us the survey failed held out.

**Why the rows tie.** The fit sees a wheel only through each revolution's mean speed. A take whose parts all land
inside one revolution slows that revolution's mean by the mean of (b - t_i) / p over its parts, which to first order in
p / tau is one step at their mean time, and every later revolution sees it through the sum of e^(t_i / tau), the same
step again to order (take / tau)^2. At the survey's speeds a revolution lasts 10-27 ms, longer than any candidate's
take, so the fit can almost always slide a candidate's whole take into the ball's revolution and match the step.
`tests/take_blind_trace.py` refits one held-out build's 22 wheels at every candidate through a copy of the fit that
also returns t0, and places each part against the revolution edges (eval/take-blind-trace-2026-11-18.txt): of 231
spread candidates inside one revolution, 143 tie the step to 0.1% with t0 + their mean offset within 1-3 us of the
step's t0, and the rest differ by the t0 grid's own scatter; all 33 that straddle an edge differ. Only four of 22
wheels tell the candidates apart, the same four at either clock (the 6 ms candidate 31-76 ppm against the step's
123-438), and even the right candidate fits them 10-20 times worse than a take-blind wheel, because four parts are not
the simulator's continuous profile.

**What broke at 1/8 us.** `ResidualSurvey` leaves out a wheel whose best rms is over `SURVEY_TRIM` (5) times the median
wheel's, a guard written for the ESC-lag survey (section "One wheel's misses outvoted the drill"). At whole microseconds
the median is 20-60 ppm and the straddling wheels stay in; at 1/8 us it fell to 3-5 ppm and they were dropped.
`tests/take_survey_trim.py` rescores stored captures' board rows with the board's own sums: on the failed held-out set
the trim dropped 101 wheels and named and advised 14 of 54 spread takes; with no trim, 42 (43 at whole microseconds).
The dropped wheels are the informative ones (spread across candidates 5.4 times their best, against 2.0 for the kept).
At whole microseconds the trim never fired on any of the 432 stored drills.

**Held out, twice.** The first pre-registered set (lag 0.38 s, seed 13) missed its first clause: its wheels' floor was
25 ppm even at 1/8 us, so the trim dropped nothing and the change could not be seen either way; by its rule nothing
shipped. A second pre-registration, a non-inferiority rule on a third set (lag 0.52 s, seed 17), held on every clause:

| set (72 drills each, capture on) | sub 8, trim 5: named and advised (of 54) | sub 8, no trim | sub 1 (either trim) | wheels the trim dropped at sub 8 |
| --- | --- | --- | --- | --- |
| design (0.3 s, seed 7) | 45 | 44 | 25 | 109 |
| first held out (0.45 s, seed 11) | 14 | 42 | 43 | 101 |
| fresh (0.38 s, seed 13) | 45 | 45 | 30 | 0 |
| third (0.52 s, seed 17) | 42 | 42 | 40 | 0 |

**What shipped.** `controller.TAKE_SURVEY_TRIM = 0`: the take survey sums every wheel (`ResidualSurvey(grid, trim)`; the
ESC-lag survey keeps `SURVEY_TRIM`). By the same rule `config.TACH_CAPTURE_SUB` is now 8 for the capture tachs
(`TACH_CAPTURE` itself stays off). Over the four sets, no trim at 1/8 us named and advised 173 of 216 spread takes
against 138 at whole microseconds. `tests/test_host.py` checks that ten take-blind wheels and one straddling wheel pick
6 ms with no trim and the step with the trim.

**Not known.** One instant build of 72 is still advised at 1/8 us (the first held-out set's launcher 1, 3.5 ms at share
0.57, just inside the 0.6 margin), with or without the trim; whole microseconds advised none. Why the floor sat at 4-6
ppm on two sets and 25 on another is not traced. And the deeper finding stands: the survey can only see a take on balls
whose contact straddles a revolution's edge, a few wheels a drill, so a drill's verdict rests on those few. Next: a
survey that scores only the wheels where some candidate's parts must straddle (or a model whose take is continuous), and
the advised instant build.

## The take survey skips take-blind wheels (2026-11-18, after "Take-blind rows traced"; on by its pre-registered rule)

**The item.** The section above found that most wheels fit every contact-time candidate alike, and named next "a
survey that scores only the wheels where some candidate's parts must straddle".

**The rule.** Such a wheel adds the same to every candidate's sum, so it cannot move the pick; it only pulls the best /
step share toward 1, where `host.TAKE_ADVISE_RATIO` (0.6) stops advising. The board cannot cheaply tell from the edge
times which balls straddle, but the wheel's own row says it: `ResidualSurvey(grid, trim, blind)` leaves a wheel out
of the sums when its worst candidate's squared rms is at most `blind` times its best's. No extra memory (a left-out
wheel is not kept, so `SURVEY_KEEP`'s 128 rows hold more informative wheels), one min and max per wheel. A wheel left
out still counts as surveyed, so the Pi's wait sees the count rise; while every wheel so far is blind the frame carries
the count with zero rms, and `take_survey_advice` says no ball told the contact times apart and to keep `TAKE_US`.

**Chosen, then held out.** `tests/take_survey_blind.py` rescores stored captures' board rows. On the ten stored sets
(all seen before, so design numbers) a `blind` of 1.5 took spread takes named and advised from 330 of 540 to 398 (of 537 with a verdict; 3 builds had every wheel left out) and
the one advised instant build to none (eval/take-survey-blind-design-2026-11-18.txt). Pre-registered on two fresh sets
(lag 0.6 s, seed 19), captured from a frozen tree:

| fresh set (72 drills) | named and advised, off -> 1.5 (of 54) | instant advised | within 1 ms (of 72) |
| --- | --- | --- | --- |
| MCPWM capture, 1/8 us | 54 -> 54 (at its ceiling) | 0 -> 0 | 72 -> 72 |
| jittery tach (the board's default) | 12 -> 26 | 0 -> 0 | 68 -> 68 |

Every clause held, so `controller.TAKE_SURVEY_BLIND = 1.5` ships (eval/take-survey-blind-2026-11-18.md). On the
jittery tach the gain is at 0.5 to 1 us (3 -> 8 and 1 -> 6 of 9 per jitter); at 1.5 us and above it is still close to
blind (0 -> 1 of 9).

**Not known.** Whether 1.5 is right for a real wheel, whose blind rows will not tie as exactly as the simulator's;
the capture set sat at its ceiling and so could not show a gain; a verdict now rests on fewer wheels (on the jittery
set 1149 of 1584 were left out), and `ESC_SURVEY_MIN_WHEELS` still counts all of them. Next: count only the kept wheels
toward the 16-wheel minimum (a frame field), and the advised instant build of "Take-blind rows traced".

## The take survey's verdict needs two informative wheels (2026-11-18, after "The take survey skips take-blind wheels"; built, kept off by its pre-registered rule)

**The item.** The section above left `host.ESC_SURVEY_MIN_WHEELS` (16) counting every wheel the take survey saw,
including the take-blind ones left out of its sums, and named next "count only the kept wheels toward the 16-wheel
minimum (a frame field)".

**The frame field ships.** `ResidualSurvey.kept_n` counts the wheels summed; the TAKE_SURVEY frame (0x84) carries it
as a new last byte (to 255), and the Pi reads it into the survey (`"kept"`) and the shot log. The Pi still decodes the
shorter frame of older firmware (`protocol.OLDER_FORMATS`), with `"kept": None`. `host.TAKE_SURVEY_MIN_KEPT` holds a
verdict back, saying how many wheels told the contact times apart, when fewer than that many were summed.

**Counting kept wheels toward 16 would silence the survey.** `tests/take_survey_kept.py` rescores stored captures'
board rows at a minimum K on the kept wheels, at the drill's end and at every 16-wheel-or-longer prefix (a shorter
drill). The jittery-tach drills keep a median of 3, 5 and 6 wheels of 22, so at K = 16 none of the three jittery sets'
72 right end-of-drill verdicts is advised (eval/take-survey-kept-design-2026-11-18.txt). The 16-wheel minimum stays on
every wheel surveyed.

**A small minimum, pre-registered, failed held out.** On the twelve stored sets a prefix verdict resting on one kept
wheel was wrong 12 times in 37 against about 1% on more, so K = 2 was pre-registered (eval/take-survey-kept-2026-11-18.md,
committed before the capture): on a fresh jittery set (lag 0.7 s, seed 23) the one-wheel verdicts had to be wrong at
three times the others' share. They were wrong 0 times in 6, the rest 6 in 140; end-of-drill verdicts were 21 right
either way and no take was invented. By the rule the minimum ships at 0: the count is reported and nothing is held.

**Not known.** Counted by drill, the design evidence was two wrong drills of 14 (prefixes of one drill are
near-repeats), and held out two right of two, so whether one informative wheel is too few is not settled by these
sets; a minimum would need drill-level counts over more fresh sets. Still open from before: the sub-8 advised instant
build, and whether `TAKE_SURVEY_BLIND`'s 1.5 suits a real wheel.

## An ESC with its own speed loop (2026-11-18, after "The take survey's verdict needs two informative wheels"; the board's loop fixed, a drop fit for it tried and kept off)

**The item.** Every fit above models the wheel as a lag of the throttle the board sends. A builder may instead run
VESC-class firmware in a speed mode, where the throttle is an rpm setpoint and the ESC holds it with a PI loop of its
own. The flagship's list named it: "an ESC with its own speed loop". What does the board do then?

**The plant.** `tests/loop_residual_sweep.py`'s wheel gains a `speed_loop=(f, z, a_max)` ESC: setpoint = throttle x
the ESC's map, a PI loop on its own (exact) speed sensor with closed-loop natural frequency f and damping z, the
wheel's drag w / tau, the drive clamped to the motor's acceleration limit, 0.1 ms steps. Its revolutions advance at
each millisecond's mean speed, not its end speed as the other plants' do: a fast loop moves the wheel a few per cent
within a millisecond after a ball, and the end-speed rule alone read 1.5-3.5% low on a fit that is exact on its own
model (the other plants keep the rule their recorded sweeps used, and their numbers did not move).

**The board's own loop rang.** `WheelLoop`'s proportional term was tuned on a wheel that lags its throttle by
0.2-0.8 s. On top of an ESC that reaches a setpoint in tens of milliseconds, seen through a 4-revolution tach, it is
a loop gain of about 1.8 behind a delay. `tests/speed_esc_sweep.py` runs one wheel with no ball for 6 s, starting
at its target with an empty integrator, over 12 ESC loops (2-20 Hz, damping 0.4 and 0.7) x 4 targets (600-6,000 rpm) x
3 setpoint maps (7,000, 9,000 and 11,000 rpm at full throttle against the 9,000 the board is told), and reads the last
second (eval/speed-esc-sweep-2026-11-18.txt):

| board loop | swing over the last second, median / worst (% of target) | worst mean error | wheels swinging over 1% |
| --- | --- | --- | --- |
| today's PI | 0.00 / 147.7 | 3.22% | 48 of 144 |
| no P, no I (feedforward only) | 0.00 / 0.00 | 22.2% (the map's error, untrimmed) | 0 |
| no P, 0.3 x the integral gain | 0.00 / 0.41 | 0.69% (still trimming) | 0 |
| no P, 0.5 x | 0.00 / 0.00 | 0.05% | 0 |
| no P, 0.7 x | 0.00 / 0.00 | 0.04% | 0 |
| no P, 1.0 x | 0.00 / 1.18 | 0.08% | 1 |

**What shipped.** `config.ESC_SPEED_LOOP` (off by default; `main.py` passes it to both wheel loops) makes `WheelLoop`
drop its proportional term and keep `controller.SPEED_ESC_KI_SHARE` (0.5) of its integral gain, a slow trim for an
ESC whose setpoint is not exactly throttle x `WHEEL_RPM_FULL`. 0.5 is the low end of the flat band; 1.0 starts to
ring on a 2 Hz, damping 0.4 loop. Picked on the same cases it is measured on. `tests/test_host.py` checks the gains
and that the case the PI rings on (5 Hz, damping 0.4, 2,500 rpm, an 11,000 rpm map) swings over 5% with the PI and
under 0.2% with this.

**The drop fit marks it.** With the speed-ESC loop on, the board's loop-command fit on the speed plants read 75 drops
more than 2% off and marked all 75 unsure (105 of 216 gave no fit at all; eval/loop-residual-speed-2026-11-18.txt; with
the old PI on top, 64 of 64, eval/loop-residual-speed-board-pi-2026-11-18.txt). So a speed-mode ESC does not
calibrate the launcher silently wrong; the Pi's warning (README "When the wheel is not a first-order lag") fires. It
does not calibrate it at all, though, and `config.py` says to calibrate with the ESC in duty mode.

**A fit for the speed loop, tried.** A PI loop answers a step in its error, from a setpoint step or a ball, with
x(t) = e^-sig t (cos wd t - sig / wd sin wd t), and its integral has a closed form, X(t) = e^-sig t sin(wd t) / wd. So a
revolution's mean deficit is linear in the drop for a given loop and ball time, and cheap enough for the board.
`tests/speed_loop_fit.py` fits that (c, a transient from before the window, the setpoint steps the board sent, the
drop), searching t0 as `drop_from_commands_steps` does. Told the true loop it reads its own model to 0.01%
(`tests/test_speed_loop_fit.py`) and the simulator's wheels within 0.3% while the ESC's drive stays under its limit.
But one ball cannot tell a big drop that recovers fast from a small one that recovers slowly, so on a per-wheel
grid of loops it read up to 40% off; and the loop is the build's, so `tests/speed_loop_survey.py` picks it the way the
ESC-lag survey picks a lag, summing every wheel's squared rms over a drill of 24 balls, then reads each ball at the
pick. On 16 builds (2-20 Hz, damping 0.4 and 0.7, drag 0.2 and 0.8 s, the current limit at the motor's stall
acceleration 9,000 / tau rpm/s), exact and 5 us tachs (eval/speed-loop-survey-2026-11-18.txt):

| builds (two tachs each) | worst drop error at the survey's pick | marked unsure | worst unmarked |
| --- | --- | --- | --- |
| 2 Hz, drag 0.2 s (4) | 1.2-4.0% | 6-21 of 24 | 2.2% |
| 2 Hz, drag 0.8 s (4) | 3.4-18.5% | 21-24 of 24 | 0.8% |
| 5 Hz (8) | 3.2-55.5% | 3-24 of 24 | 6.2% |
| 10 and 20 Hz (16) | 26-95% | 24 of 24 | 0% |

Over all 768 balls, 592 read more than 2% off and 571 of those were marked; 95 read within 1%. The board's own
loop-command fit on the same drills read 215 drops, marked all 164 of those more than 2% off, and marked a drop in all
16 drills. Only a slow (2 Hz) loop on a light-drag wheel reads well, and a real speed loop is rarely that slow.

**Why it fails: the current limit.** A 10% drop at 6,000 rpm is 600 rpm of error; a 10 Hz loop at damping 0.7 asks
for 88 x 600 = 53,000 rpm/s, over a motor's 11,000-45,000. While the drive is clamped the wheel recovers on a ramp
the linear kernel lacks. With the limit lifted, the same 10 Hz wheels read within 0.3% told the true loop (its damping raised by the drag's
1 / (2 tau wn)). Modelling
the ramp needs the limit (one more number per build, which a spin-up from rest at full current shows on the tach) and
a fit no longer linear in the drop. Kept off the board: `controller.py` holds only the loop fix.

**Not known.** All of this is one assumed ESC: a textbook PI on an exact sensor, an integrator frozen while clamped.
VESC's speed loop has its own filters, ramps and anti-windup, and none of the gains here are a real ESC's. Next: log a
real VESC in speed mode (its own rpm and current over UART, against the hall tach) through a ball, and see whether
its recovery is the clamped ramp then the PI tail; a ramp-then-PI fit with the limit from a spin-up.

## A ramp-then-PI drop fit for a speed-mode ESC (2026-11-18, after "An ESC with its own speed loop"; host-side, in `tests/`, not on the board)

**The item.** The section above left a speed-mode ESC uncalibrated: its linear PI fit read up to 95% off because a
ball drives a fast loop into the motor's current limit, and while the drive is clamped the wheel recovers on a ramp the
PI curve lacks. The flagship's list named the next step: "a ramp-then-PI drop fit for a speed-mode ESC (limit from a
spin-up)". `tests/speed_ramp_fit.py` is that fit, and it needs three readings per build that a ball cannot give.

**The model.** The simulator's ESC (tests/loop_residual_sweep.py): a PI loop with natural frequency wn and damping z,
its output an acceleration clamped at the limit a, the integrator frozen while clamped, and the wheel's drag w / tau.
In shares of the speed w0 before a ball of share D:

- *ramp:* e(t) = 1 - W - (1 - D - W) e^-t/tau with W = a tau / w0, while the proportional term plus the held integrator
  (w0 / tau) asks for more than a, so until e falls to e* = (a - w0 / tau) / (2 z wn w0);
- *tail:* from there the linear loop with the drag folded into its damping (z + 1 / (2 tau wn)), starting at e*.

A ball under e* never clamps. Both pieces have closed-form revolution means, so the offset, a transient and the board's
setpoint steps stay linear and D is a one-dimensional golden-section search per ball time. Two details mattered on the
simulator:

- The board's own trim (`ESC_SPEED_LOOP`, an integral-only loop) steps the setpoint while the ESC is clamped. The
  clamped wheel ignores those steps, but they move the exit and leave the integrator below the new setpoint's resting
  value. `BallResponse.plan` carries them through the clamp. Without it a 20 Hz, damping 0.4, drag 0.8 s build at
  4,000 rpm read 10% drops 1.8-2.3% off; with it, 0.1-0.3%.
- On a drag-bound wheel a setpoint step also moves the integrator's resting value by du / tau, so its error is
  du (x + X / tau), not du x.

**The three readings.**

1. *The limit and the drag, from a spin-up* (`spinup_fit`). From rest at the current limit (VESC current mode, or a
   setpoint above what the wheel can reach), dw/dt = a - w / tau, so the edge count is linear in a for each tau and tau is
   a golden-section search. On 3 s spin-ups it read a and tau within 0.03% on every build, at 0 and 5 us of jitter.
2. *The loop, from a setpoint step train* (`loop_from_steps`). The board moves its command up 2% and back four times (eight steps),
   400 ms apart, at 1,500 rpm on a free wheel. The wheel's revolution means are closed-form in (f, z), linear in the
   speed and the step's scale. The fit grids 1-40 Hz x 0.2-0.95, then refines. Picked within 1.5% in frequency and
   0.05 in damping on all 32 build-tach pairs. `step_clamped` checks that a step stayed under the limit: a 2% step at
   3,000 rpm clamped a 20 Hz, drag 0.8 s build and was read as 16 Hz, damping 0.92.
3. *The ball,* read with both of those.

**Picking the loop from the balls instead, tried first.** The ESC-lag survey picks its lag from the drill's own balls,
so this did the same: the least summed squared rms over the 24-ball drill on a 24 x 16 grid, then refined. The loop is
only weakly fixed by the balls, though. A 2 Hz loop picked at the grid's 1.90 Hz read drops up to 8% off. Refining
helped there but moved a 5 Hz build from 4.97 to 5.07 Hz, which took its worst drop from 0.65% to 4.3%. The step train
gives the loop with no balls at all.

**Measured.** The same 16 builds and 24-ball drills as `tests/speed_loop_survey.py` (2-20 Hz, damping 0.4 and 0.7, drag
0.2 and 0.8 s, the limit at the stall acceleration 9,000 / tau rpm/s; exact and 5 us tachs, so 768 balls).
`tests/speed_ramp_survey.py`, with eval/speed-ramp-step-2026-11-18.txt (`--step`) and
eval/speed-ramp-survey-2026-11-18.txt (the ball survey):

| fit and loop pick | drops more than 2% off | of those unmarked | within 1% (unmarked) | worst unmarked |
| --- | --- | --- | --- | --- |
| linear PI, ball survey (the section above) | 592 | 21 | 95 (40) | 6.2% |
| ramp-then-PI, ball survey | 225 | 85 | 406 (290) | 6.24% |
| ramp-then-PI, step train | 88 | 11 | 581 (436) | 3.84% |
| ramp-then-PI, told the true loop | 72 | 7 | 605 (450) | 2.62% |

By loop, with the step train: 2 Hz builds worst 4.35% (unmarked 1.46%), 5 Hz 3.96% (2.75%), 10 Hz 18.0% (3.84%) and
20 Hz 119% (2.76%). The linear fit's worst at its pick was 18.5%, 55%, 77% and 95%.

**The mark.** A drop is marked unsure, as the board's fits are, when its standard error is over `LOOP_SE_MAX`. Two
changes:

- The standard error counts the ball's time as a fitted parameter.
- A second gate, `SEEN_MIN` (0.05), measures how much of the ball the revolutions show: the rms over the window of the
  part of dG/dD that no other column can stand in for, per unit drop.

A 20 Hz loop on a light wheel at 1,500 rpm recovers inside the ball's own 40 ms revolution, and only the shape inside
that revolution carries the drop. Those balls read 18-56% off with residuals of 2e-5. 0.05 was picked on these builds;
told the true loop it keeps 351 of 384 exact-tach drops with the worst at 2.3%.

**Held out.** 12 other builds (3, 7 and 14 Hz; damping 0.5 and 0.85; drag 0.3 and 0.5 s) and 24 other balls (1,200-5,000
rpm, 4-12% drops), none of which any choice above was made on (eval/speed-ramp-step-heldout-2026-11-18.txt):

- With the step train's pick, 446 drops were read of 576. 65 were more than 2% off and 60 of those were marked. The
  worst unmarked was 2.17% (told the true loop, 1.38%).
- The 130 unread balls are all at 1,200 rpm, where the simulator's 200 ms record before the ball holds 4 revolutions and
  every fit here needs 5.

**Not known, and not on the board.** This is still one assumed ESC: a textbook PI on an exact sensor, a hard current
clamp, an integrator frozen while clamped. VESC's speed loop has its own filters, ramps and anti-windup, and none of the
gains are a real ESC's. Nothing here runs on the ESP32 or the Pi. Porting it would need three things:

- the board to run the spin-up and the step train and log them;
- a frame to carry them;
- `fit-launcher` to take the drops.

That is worth doing only once a real VESC's log shows the clamped ramp and PI tail. The hardware test is unchanged: log
a VESC in speed mode through a ball (its own rpm and current over UART, beside the hall tach). The same log gives the
three readings above, so it checks this fit directly.

    PYTHONPATH=src:tests:firmware/esp32 python tests/speed_ramp_survey.py --step [--heldout]
    PYTHONPATH=src:tests:firmware/esp32 python -m unittest tests/test_speed_ramp_fit.py

## A queued survey's heap (2026-11-18, after "A ramp-then-PI drop fit for a speed-mode ESC"; on by its pre-registered rule)

**The item.** The ESC-lag and take surveys run one at a time, and the rest wait in `LaunchCheck.survey_queue`
(section "The ESC-lag survey's search, traced"). The depth was set at 2 "for the ESP32's heap" without a byte count.
The seventh lag then cost wheels, and section "The ESC-lag survey between 100 and 200 ms" left this open: "whether
`SURVEY_QUEUE` 3 fits the ESP32's heap".

**How it was counted.** No board was at hand, and building MicroPython in this session was not allowed. So
`tests/survey_heap.py` sizes each queued survey on the simulator's drills by the layout of MicroPython 1.24's ESP32
port, read from its source:

- 16-byte heap blocks;
- integers under 2^30 held in the pointer;
- a float a boxed single, one block;
- a tuple of n is 2 + n words;
- a list is a 4-word header plus an items array that starts at 4 and doubles;
- an array grows 8 items at a time.

A class instance and a waiting generator are estimates (4 and 6 blocks).

**What a survey held.** Each holds its ball's two period snapshots and two tick logs. The snapshots are small: up to
128 integers a wheel, about 0.5 KB. The tick logs are not. Every control tick appends a tuple (edge count, us since
that edge, command), and the command is a float. That is 2 blocks for the tuple, 1 for the float and a slot in the
list: about 48 bytes a tick, 115 ticks a wheel on these drills. A waiting survey held 11.1-12.8 KB. At depth 2 the
running survey and the waiting one pinned 25.6 KB, almost half of the 56 KB the ESP32 port starts its heap at. Depth 3
with tuples would pin 38.4 KB.

**The fix.** `controller.PackedTicks` stores a log as three arrays: two of 32-bit integers, and one of the board's own
single floats ("f"; "d" on the host so the simulator stays bit for bit). That is 12 bytes a tick. It iterates as the
same tuples, so no fit changed. `_loop_fit` packs the logs as it queues the survey (`PACK_SURVEY_TICKS`, on), and
`last_ticks` takes the packed copy so the tuples are freed.

**Pre-registered** (written in the script before the first run). Prediction: a survey with tuples holds 10-25 KB, and
packed under 8 KB. Rule: depth 3 ships if, on every drill,

- (a) depth 3 packed pins no more than depth 2 with tuples;
- (b) packing changes nothing at depth 2 (wheels surveyed, the pick, cuts and every launch record);
- (c) depth 3 surveys at least as many wheels as depth 2.

The drills were rally, example and calibration, on three builds: a 0.4 s first-order wheel, a 50 ms ESC on a 0.6 s
wheel, and a 3 us jittery tach. The first run's "ESC" build only told the board a lag, with no ESC in the plant, and it
picked 0 ms. It was rerun with the ESC in the plant, and the jittery tach was added before that rerun.
eval/survey-heap-2026-11-18.txt has the results:

| form, depth | KB a queued survey | peak pinned KB | wheels surveyed (rally / example / calibration; first-order, ESC 50 ms, jittery) |
| --- | --- | --- | --- |
| tuples, 2 (as shipped) | 11.1-12.8 | 25.6-25.7 | 16/6/16, 20/6/22, 16/6/16 |
| packed, 2 | 3.4-4.0 | 8.0 | the same, and every record the same |
| tuples, 3 | 11.1-12.8 | 38.1-38.4 | 18/8/18, 22/8/24, 18/8/18 |
| packed, 3 (ships) | 3.4-4.0 | 11.8-12.0 | 18/8/18, 22/8/24, 18/8/18 |

All three clauses held on all 9 drills, and the prediction held. `SURVEY_QUEUE` is 3. Packing frees 13.6 KB at the
old depth, and the new depth still needs less than half the heap the old one pinned. Two more wheels reach the survey
on every drill: the ESC build's calibration drill now surveys 24 of 24, with none cut. The ESC build picks 46-47 ms
at both depths.

**A test that leaned on the old depth.** The extra queued survey makes the Pi's end-of-drill wait longer: 42.5 s
in place of 37.5 s on `tests/test_host.py`'s four-shot drill. That is past the lift's 16 s run-on after the last
ball, so the lift had rightly stopped when the test read its duty. The test now reads the duty inside the run-on.

**Not known.** These are counts against a model of the layout, not a reading of a board's heap. The heap free with
`main.py` loaded is not known, nor is how the split heap grows past 56 KB, and the running survey's working lists
(one wheel's re-based and lagged ticks, an estimated 10 KB) are the same at any depth and not counted. The stroke's own
live tick log (up to `TICK_LOG` = 240 tuples a wheel, about 23 KB for both) is still tuples, because it is appended every tick and
packing it there would add an array append to the control loop. Next: `gc.mem_free()` on a real WROOM-32 after a
rally drill, at depth 2 and 3. If the live log is the board's largest holder, pack it as it is logged.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/survey_heap.py

## The ESC-lag survey's pick between grid lags (2026-11-18, after "A queued survey's heap"; on by its pre-registered rule)

**The item.** Section "Long ESC lags" moved the survey's refits to 16 revolutions after the anchor and noted that short
lags then read a little low: 40 ms read 36-37 and 50 ms read 44-47. 210-250 ms read 222-271. All were within 15%,
but a builder sets `ESC_TAU_US` from this number.

**The window or the pick?** Refit at 28 lags from 0 to 400 ms with the same 16-revolution window (the stored drills of
`tests/esc_survey_window.py`), the least summed residual sat on the true lag for every 40, 50 and 90 ms build, to the
5 ms step. So the window is not biased. The survey's refinement is: `survey_pick` draws a parabola through the least
grid sum and its two neighbours in the lag's log. Near its least the residual curve is a V, steeper on one side
than the other. A parabola through three points of a lopsided V puts its vertex off the true least, and which way it
falls depends on where the true lag sits between the grid lags.

**Tried on the design set** (those 70 drills, scored by the board's own sums, `ResidualSurvey`, on the shipped grid):

| pick between grid lags | within 5% | within 10% | within 15% | max error | mean error |
| --- | --- | --- | --- | --- | --- |
| parabola, log axis (shipped) | 41 | 66 | 70 | 11.7% | 4.4% |
| natural cubic spline through all 7 sums, log(lag + 10 ms) | 68 | 70 | 70 | 6.4% | 1.3% |

Also tried and dropped: the parabola on rms, on log sums, and on square-root or linear lag axes (no better than 41;
the linear axes 25-35); a four-point cubic (56); the spline on rms (55) or on a linear axis (35). Moving the seven grid
lags was tried too: geometric grids with the parabola scored 24-41. A search over 4,368 seven-lag grids found 56 at
best, by putting grid lags on the design set's own ESC lags (120 and 250 ms), which would not carry over. The spline's
only setting is the offset that gives 0 ms a place on the log axis: a quarter of grid[1] scored 68, half 68, one 65
and two 61, so half (10 ms) ships.

**Held out.** The prediction and decision rule were committed before the capture ran (commit 3de646cbe, in
`tests/esc_survey_spline.py`). The held-out set used ESC lags none of the design drills used (25 / 33 / 45 / 60 / 75 /
110 / 130 / 160 / 185 / 220 / 270 ms), wheel lags 0.45 and 0.65 s, rally and calibration drills, seed 13, and the second
true launcher: 44 drills, every one counted (20-26 wheels). The board's survey ran unchanged, and both picks were
scored on the same sums (eval/esc-survey-spline-2026-11-18.txt):

| held out (44 drills) | within 5% | within 15% | max error | mean error |
| --- | --- | --- | --- | --- |
| parabola | 27 | 40 | 48.1% | 7.1% |
| spline | 39 | 42 | 48.1% | 4.1% |

The rule held on all three of its clauses: more drills within 5%, as many within 15%, and a max error no larger.
`controller.ESC_SURVEY_SPLINE` is True. The max error is the same for both picks because two of the four 270 ms drills
had their least sum at the grid's 400 ms end. There both picks give the grid point, and the Pi already answers that
pick by telling the builder to scope the ESC. The prediction held in part. The spline put 89% of drills within 5%
(predicted 85% or more) and the parabola 61% (predicted under 65%). On the 25-75 ms drills the spline's mean signed
error was -2.4% (predicted within 3%). The parabola's was +2.0%, though, where I had predicted below -4%: it read 25-33
ms high (28-35) and 45-60 ms low (40-58), so its error changes sign between grid lags rather than always reading low.
The spline's worst short reads are 25 ms as 23-24.

**The cost.** None in the survey: the refits, the grid, the ESC_SURVEY frame and the survey's time are unchanged. A
Pi and a board from either side of this change read each other's frames, and only the refined lag in the frame
moves. The pick solves a 7-point tridiagonal system and two quadratics each time the report is built. The take survey
keeps the parabola, since nothing here tested it there.

**Not known.** All simulated: a first-order ESC behind a first-order wheel, one seed per set. The V's shape comes
from that model, and a real ESC's step response may bend it differently. Next: a real ESC's lag on a scope; whether
the take survey's pick between its contact times has the same lean.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_survey_spline.py --score eval/esc-survey-spline-heldout-rows-2026-11-18.jsonl.gz

## The take survey's pick between contact times (2026-11-18, after "The ESC-lag survey's pick between grid lags"; the parabola kept by its pre-registered rule)

**The item.** The section above found that the ESC-lag survey's three-point parabola read a lopsided V-shaped residual
curve off its least, and shipped a natural cubic spline. The take survey (`ResidualSurvey.report`) still draws the
parabola through its least sum and two neighbours on the grid 0, 2, 3, 4, 5, 6 and 8 ms. Does it lean the same way?
No stored take capture could say: every one had its true take on a grid point (0, 3, 4 and 6 ms).

**How it was checked.** `tests/take_survey_pick.py` captures survey drills (the calibration drill with SURVEY_TAKE on,
the board's grid, depth, window, trim and blind rule) with half-sine takes between grid points (1, 2.5, 3.5, 4.5, 5.5
and 7 ms), with 3 and 6 ms on the grid as a check, and with an instant take. Each runs on the MCPWM capture tach at
1/8 us and on the board's default jittery tach at 0.5 us, for each of the three launchers. It keeps every surveyed
wheel's periods and ticks and refits each wheel offline every 0.25 ms from 0 to 8 ms with the board's own fit. The
"dense least" is the candidate whose sum over the wheels the board kept is least: where the survey's own residual
curve bottoms out. The picks come from the board's seven grid sums.

**What it found.** Between interior grid points the pick barely leans. The fit itself reads high:

| off-grid takes (18 a tach) | dense least - true | parabola - dense least | spline - dense least | within 0.5 ms of true: dense / parabola / spline |
| --- | --- | --- | --- | --- |
| design (lag 0.45 s, seed 29), capture | +0.38 ms | -0.13 | +0.01 | 16 / 12 / 11 |
| design, jittery 0.5 us | +0.78 | -0.28 | -0.21 | 13 / 9 / 9 |
| held out (lag 0.6 s, seed 31), capture | +0.31 | -0.22 | -0.10 | 18 / 12 / 11 |
| held out, jittery 0.5 us | +0.21 | -0.14 | -0.03 | 17 / 12 / 11 |

The spline follows the residual curve's own least more closely, as it did for the ESC lag. But the take fit's least
sits 0.2-0.4 ms above the true take: four parts stand in for the simulator's continuous half-sine (section "Take-blind
rows traced"). The parabola's small low lean happens to offset that, so the spline is no closer to the truth. Seven
grids of seven to nine points were scored offline from the same dense refits (`--grids`). On the Pi's own test (the
pick rounded to 0.5 ms, within 1 ms) every grid scored 46-47 of 53 on the design set, and none advised an instant build.

The larger error is at the grid's ends. Every 7 ms take read 8.0 on both sets: the least grid sum is at 8, and there
is no candidate above 8 to refine against. At 1 ms, 11 of 12 builds read 0. There the step candidate wins, and the
share sits at 1.00, so no contact time is advised. Both errors are exactly 1 ms, the edge of the Pi's tolerance.

**Held out.** The prediction and decision rule were committed before the capture ran (commit 759ce4dea, in
`tests/take_survey_pick.py`'s docstring). The prediction held on all three clauses:
(a) on the capture tach the spline sat -0.10 ms from the dense least (predicted within +-0.15), with the parabola
below it at -0.22; (b) the dense least read high on both tachs; (c) the spline was within 1 ms of the true take on 53
builds of 54 and the parabola on 54. By the rule (the spline needs more within 1 ms) the parabola stays. The nine-point
grid (0 to 8 ms by 1) against the shipped one, both with the parabola: within 1 ms 53 against 54, so it fails the
rule's first clause and the shipped grid stays. It did name and advise 37 of 48 spread takes against 35, and put 52
within 0.5 ms against 41; a tighter tolerance than the Pi's would choose differently (eval/take-survey-pick-2026-11-18.md).

**What shipped.** No firmware change. The Pi's advice now treats the grid's last contact time as the ESC-lag advice
treats its last lag. When the survey picks 8 ms, `host.take_survey_advice` says the contact lasts about 7 ms or
longer and that the survey cannot name it more closely, and still sets `TAKE_US = 8000` (`tests/test_host.py`).

**Not known.** All simulated, one seed per set, an assumed half-sine profile. The fit's 0.2-0.4 ms high reading is
consistent across sets, but nothing here shows that it carries to a real ball. Next: whether a take model with more
parts, or a continuous one, removes that reading. Without that, a finer grid only sharpens a biased least.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-survey-pick-heldout-rows-2026-11-18.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-survey-pick-heldout-rows-2026-11-18.jsonl.gz --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

## The take fit's four parts and its high reading (2026-11-18, after "The take survey's pick between contact times"; on by its pre-registered rule)

**The item.** The section above found the take survey's own residual curve bottoming out 0.2-0.4 ms above the
simulator's true half-sine take, and named the four-part take model as the likely cause. Does a model with more parts
remove that reading?

**Why four parts read long.** The survey captures run the plant at 0.1 ms steps, so the simulator's own step adds
only 0.01/12 ms² to the take's spread. A take a few milliseconds long reaches a revolution's period mostly through its
centre and its spread. Every model here is centred on the take's middle, so the spread is what a contact time gets
fitted against. A half-sine's variance is 0.0474 T². Four equal shares at its quantile midpoints (0.230, 0.420, 0.580
and 0.770 of T) carry 0.0397 T², 16% less. To match a true take's spread the fit needs a T about
sqrt(0.0474 / 0.0397) = 1.09 times longer: about +0.4 ms at 4 ms.

**How it was checked.** `tests/take_parts_refit.py` refits every stored survey wheel of the previous section's rows
(they keep each wheel's periods and ticks) at every contact time from 0 to 8 ms by 0.25 ms. It tries four models:
the shipped midpoints, 8 and 16 parts, and `spread`, the four midpoints stretched about T/2 so that they carry the
half-sine's own variance (offsets 0.205, 0.412, 0.588 and 0.795 of T: four fits a wheel, as now). Each model is
scored on the wheels the board kept.

**What it found.** Dense least minus true take on the off-grid takes (1, 2.5, 3.5, 4.5, 5.5 and 7 ms), signed mean,
with builds within 0.25 ms of 18:

| set, tach | shipped 4 | spread 4 | 8 parts | 16 parts |
| --- | --- | --- | --- | --- |
| design (lag 0.45 s, seed 29), capture | +0.38 (12) | +0.03 (16) | -0.04 (16) | +0.04 (17) |
| design, jittery 0.5 us | +0.78 (8) | +0.39 (13) | +0.46 (13) | +0.33 (13) |
| held out (lag 0.6 s, seed 31), capture | +0.31 (12) | -0.07 (18) | +0.10 (18) | +0.00 (18) |
| held out, jittery 0.5 us | +0.21 (11) | -0.04 (17) | +0.04 (17) | +0.00 (18) |

So the bias is the model's: with 16 parts the least lands on the true take. The board's verdict on the shipped grid
(parabola, rounded to 0.5 ms), held out: within 0.5 ms on 46 builds of 54 with `spread` against 41; within 1 ms on 54
for both; no instant build advised. On the design set within 0.5 ms 38 against 35, but within 1 ms 46 against 47,
and the 3 ms takes on the grid read 0.65 ms low.

**The drop.** On tests/take_fit.py's stored wheel fits (wheel lag 0.3 s, seed 7, true drops kept) the drop read at the
true contact time scattered 0.15-0.20% about the truth with every model. The shipped model at the longer time its own
survey names scattered just as little (6.5 ms on a 6 ms take: 0.18%). The high reading cost the drop nothing. It only
mislabelled the contact time the Pi reports, and pushed long takes onto the grid's end (every 7 ms take read 8 ms in
the section above).

**Held out.** The prediction and decision rule were committed before the held-out rows were scored by any model but
the shipped one (commit ad4bfdc4e, in the script's docstring). All three clauses held. (a) The shipped model read
+0.31 ms on the capture tach, above +0.15, and `spread` read -0.07, closer to zero. (b) 16 parts read 0.00. (c)
`spread` had 46 builds within 0.5 ms against 41, and no instant build advised. With within 1 ms tied at 54, the rule
passed.

**What shipped.** `controller.take_offsets` stretches the half-sine's offsets to its own variance
(`TAKE_MATCH_SPREAD = True`; `match_spread=False` gives the midpoints as before). The board still runs four fits a
wheel. Scripts that call `take_offsets` with defaults, such as `take_survey_pick.py` and `take_fit.py`, now get the
stretched offsets, so rerunning them will not reproduce their stored reports exactly. The front-loaded profile is not
stretched, because it was not tested. `tests/test_host.py` checks the offsets' centre and variance.

**Not known.** All simulated, with the simulator's continuous half-sine. One seed per set. The drop check is on one
set. A real ball's force profile is not known to be a half-sine, so what this changes is the contact time the survey
names *for a half-sine*. Held out, 33 of 48 spread takes were named and advised against 35; the rule did not count
that. The jittery tach's reading is still high on the design set for every model (+0.33 to +0.78).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_parts_refit.py --score eval/take-survey-pick-heldout-rows-2026-11-18.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_parts_refit.py --drops eval/take-fit-2026-11-17.jsonl.gz

## A fresh take survey with the stretched offsets live (2026-11-18, after "The take fit's four parts and its high reading"; `TAKE_SURVEY_SPLINE` built, kept off by its pre-registered rule)

**The item.** The section above refitted stored survey wheels offline. Do fresh survey drills, with the stretched
offsets live on the simulated board, still read 7 ms takes at the grid's end (8 ms), and the 3 ms takes low?

**How it was checked.** `tests/take_survey_pick.py --capture` (unchanged) on three sets no earlier run used: A (wheel
lag 0.35 s, seed 37), B (0.8 s, seed 43) and C (0.5 s, seed 47), 54 drills each, none aborted. Four clauses were
committed before A and B were captured (2ef796e6d); a second prediction and a decision rule for the pick were
committed after A and B were scored and before C was captured (334f5ca1e). Everything is in
`eval/take-survey-fresh-2026-11-18.md`.

**What it found.** All four first clauses held. On the capture tach none of the six 7 ms builds read 8.0 (before the
stretch every 7 ms take on the design set did); the residual's own least sat on the true take (+0.08 and -0.12 ms
off-grid); the 3 ms takes came within 0.5 ms on 5 of 6; no instant build was advised. The stretch exposed the pick's
own lean: the three-point parabola reads about 0.4-0.5 ms below the residual's least (off-grid, capture tach: -0.51,
-0.50 and -0.38 ms against the true take on A, B and C). Before the stretch that low lean was partly hiding the fit's
high reading.

**The spline, held out on C.** The natural spline (`survey_spline_pick`, already shipped for the ESC-lag survey) leaned
less (-0.27 against -0.38 on C) but tied the parabola once the Pi rounds to 0.5 ms: within 0.5 ms 48 of 54 each,
within 1 ms 53 each, spread takes named and advised 38 of 48 each, no instant build advised. The rule needed more
builds within 0.5 ms, so `TAKE_SURVEY_SPLINE` (`ResidualSurvey.report`'s pick) ships built and off. It also read the
7 ms takes lower than the parabola (-0.54 against -0.42 on C).

**The nine-point grid** (0-8 ms by 1, scored offline from the dense refits, not decided): within 0.5 ms 47, 52 and 49
against the shipped grid's 43, 46 and 48; within 1 ms never worse. Adding 7 alone changed nothing; the likely source is
the 1 ms point (1 ms takes read 0 on 16 of 18 builds on the shipped grid, all still within 1 ms and none advised).

**Not known.** All simulated, with the simulator's continuous half-sine; one seed per set.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-survey-fresh-c-2026-11-18.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-survey-fresh-c-2026-11-18.jsonl.gz --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

## The nine-point take grid on its own held-out sets (2026-11-18, after "A fresh take survey with the stretched offsets live"; the shipped grid kept by its pre-registered rule)

**The item.** On sets A to C the nine-point grid (0-8 ms by 1) scored more builds within 0.5 ms than the shipped one
(0, 2, 3, 4, 5, 6, 8 ms), offline. Does it on sets no run has used?

**A bias fixed first.** Two of A to C's six off-grid takes (1 and 7 ms) sat on the nine-point grid's added points.
The fresh sets use takes on the half-millisecond (0.5 to 7.5 ms), off both grids, plus the instant build.
`tests/take_survey_pick.py` gained `--takes` for this. `--grids` now also prints each take's verdicts on each grid.

**How it was checked.** Sets D (wheel lag 0.4 s, seed 53), E (0.7 s, 59) and F (0.55 s, 61), 54 survey drills each,
none aborted. Three predictions and a five-clause rule were committed before any of them was captured (663ca5f3d).
Everything is in `eval/take-grid-nine-2026-11-18.md`.

**What it found.** Within 0.5 ms the grids tied exactly on every set (48, 47, 46 each; 141 of 162 pooled), so the
rule's first clause failed and `TAKE_SURVEY_GRID_US` stays as it is. The other clauses held: within 1 ms 152 against
142, named and advised 93 against 92, no instant build advised. Outside the rule, on the same tables: the nine-point
grid halves the builds off by more than 1 ms (10 against 20), mostly 1.5 ms takes the shipped grid reads as 0. The
shipped grid reads every 7.5 ms take as 8.0 (18 of 18) and the 6.5 ms ones as 6.0. At half-millisecond takes the Pi's
0.5 ms rounding counts both as within 0.5 ms. Mean absolute error 0.45 against 0.53 ms. Adopting on that measure
would mean picking it after seeing the rows, so it needs a fresh set with the measure named first. The parabola's lean
below the residual's least is still there on both grids (0.29 to 0.39 ms on the capture tach).

**Not known.** All simulated. The nine-point verdicts are offline refits of wheels surveyed on the shipped grid, not a
nine-candidate board run end to end.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl --lag 0.4 --seed 53 --takes "0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-grid-nine-d-2026-11-18.jsonl.gz --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

## The nine-point take grid with the large misses named first (2026-11-18, after "The nine-point take grid on its own held-out sets"; the shipped grid kept by its pre-registered rule)

**The item.** On D to F the nine-point grid tied the shipped one within 0.5 ms but halved the builds off by more than
1 ms (10 against 20). Does that hold on fresh sets with that measure named before the capture?

**How it was checked.** Sets G (wheel lag 0.65 s, seed 67), H (0.42 s, 71) and I (0.75 s, 73), 54 survey drills each,
none aborted. D to F's takes all sat on the half-millisecond; G to I drew one take uniformly in each millisecond
(0.8, 1.75, 2.35, 3.15, 4.1, 5.4, 6.5, 7.45 ms, seed 20261118) plus the instant build. Four predictions and a six-clause
rule, with builds off by more than 1 ms as the primary measure and a margin of 4, were committed before any capture
(59750c686). `tests/take_survey_pick.py --grids` now prints both error measures. Everything is in
`eval/take-grid-fresh-g-i-2026-11-18.md`.

**What it found.** Builds off by more than 1 ms: 14 shipped against 12 nine-point, pooled, so the rule's first clause
(at least 4 fewer) failed and `TAKE_SURVEY_GRID_US` stays as it is. The other clauses held (mean absolute error 0.448
against 0.533 ms, within 1 ms 150 against 148, no instant build advised). The large misses are mostly the fit's, not
the grid's: 10 of them are the same builds on both grids, all on takes under 2 ms (1.75 ms takes read 0, instant
builds read 1.5 to 2.5 ms), where the residual curve itself bottoms out in the wrong place. Outside the rule, builds
within 0.5 ms rose from 93 to 121 at these uniform takes (every 7.45 ms take read 8.0 on the shipped grid), against a
tie on D to F; that measure needs its own fresh set, most cheaply as an eight-point grid that adds only 7 ms.

**Not known.** All simulated, one seed per set, one draw of takes; the nine-point verdicts are offline refits.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl --lag 0.65 --seed 67 --takes "0.8,1.75,2.35,3.15,4.1,5.4,6.5,7.45,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-grid-fresh-g-2026-11-18.jsonl.gz --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

## An eight-point take grid (2026-11-19, after "The nine-point take grid with the large misses named first"; 7 ms added by its pre-registered rule)

**The item.** On G to I the nine-point grid's gain within 0.5 ms (93 to 121) came mostly from the grid's end: every
7.45 ms take read 8.0 on the shipped grid. Does adding only 7 ms (one more fit a wheel, not two) buy that on fresh
sets, with builds within 0.5 ms named as the measure first?

**How it was checked.** Sets J (wheel lag 0.48 s, seed 79), K (0.38 s, 83) and L (0.68 s, 89), 72 survey drills each,
none aborted. A first one-per-millisecond take draw put no take between 6.5 and 7.5 ms, the only band the 7 ms point
can move, so before any capture it was replaced by a stratified draw (one take a millisecond 0-5, one a half
millisecond 5-8: 0.45, 1.5, 2.35, 3.25, 4.2, 5.1, 5.95, 6.1, 6.6, 7.15, 7.75 ms and the instant build). Four
predictions and a six-clause rule (at least 6 more builds within 0.5 ms, no more large misses, no higher mean error,
the same advice, no instant build advised, no set worse) were committed before the capture (d9bb7bb9e). Everything is
in `eval/take-grid-eight-2026-11-19.md`.

**What it found.** Within 0.5 ms 185 of 216 builds against 149 (+12, +13, +11 by set); builds off by more than 1 ms 15
each, the same builds, all at takes of 2.35 ms or less; mean absolute error 0.373 against 0.463 ms; the same advice;
no instant build advised. Every clause held, so `TAKE_SURVEY_GRID_US` is now **0, 2, 3, 4, 5, 6, 7, 8 ms**
(`controller.py`, `config.py`), `host.TAKE_SURVEY_MS` and `protocol.TAKE_SURVEY_TIMES` (8) follow, and the Pi still
decodes both seven-candidate frames of older firmware. The gain sits at 6.1 ms (8 to 16 of 18 within 0.5 ms), 6.6 ms
(2 to 17) and 7.15 ms (5 to 18); below 5 ms every verdict is unchanged.

**The cost.** One more refit a surveyed wheel: the simulated calibration drill held its balls 127.4 s for the surveys
against 114.4 s (+11%), 10.6 s a ball under `host.TAKE_WAIT_S`'s 12 s, with no survey cut and the same 22 wheels
summed. The TAKE_SURVEY frame is 24 bytes, not 22.

**Not known.** All simulated; the eight-point verdicts are offline refits of seven-point surveys. Whether real takes
fall in 6-7.5 ms at all is unmeasured. The large misses under 2.5 ms are the fit's, not the grid's, and remain.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl --lag 0.48 --seed 79 --takes "0.45,1.5,2.35,3.25,4.2,5.1,5.95,6.1,6.6,7.15,7.75,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score eval/take-grid-eight-j-2026-11-19.jsonl.gz --grids "0,2,3,4,5,6,8;0,2,3,4,5,6,7,8"

## Short takes: the fit sees them, the grid's end does not (2026-11-19, after "An eight-point take grid"; the shipped grid kept by its pre-registered rule)

**The item.** On J to L every build off by more than 1 ms had a take of 2.35 ms or less, and the section above
called those misses the fit's. Are they?

**How it was checked.** `tests/take_short_blind.py` refits every surveyed wheel of J to L every 0.25 ms (the board's
fit and depth, cached in `eval/take-dense-jkl-2026-11-19.jsonl.gz`) and sums the wheels the board keeps. The
prediction (the summed curve's least within 0.5 ms of a 1.5 ms take on at least 12 of 18 builds) and a rule for an
end-of-grid parabola (`end_pick`) were committed first (a541b2a93).

**What it found.** The fit is not blind: the summed least is within 0.5 ms of true on 13 of 18 1.5 ms builds, 15 of 18
at 2.35 ms and 197 of 216 overall. The curve is a flat shelf from 0 to about a millisecond below the take, then a
valley; with points at 0, 2 and 3 ms the parabola reads a 1.5 ms valley as 0 or 1 and leans 2.35 ms takes into the
shelf. `end_pick` failed (179 against 185 within 0.5 ms; 10 instant builds moved off 0 against 3). Chosen afterwards
on J to L, a grid of 0, 1.5, 2.5, 3-8 ms scored 196 within 0.5 ms and 9 large misses against 185 and 16.

**Held out.** Set M (lag 0.55 s, seed 97; 66 drills, takes stratified under 3 ms plus three checks), its rule
committed before capture (9ead6721c): within 0.5 ms 48 against 41, large misses 3 against 11, mean error 0.373
against 0.523 ms, checks 18 each, but one instant build read 0.80 ms (share 0.99, not advised) where the shipped
grid read 0. The instant-read clause failed, so **`TAKE_SURVEY_GRID_US` stays at 0, 2, 3, 4, 5, 6, 7, 8 ms**.
Everything is in `eval/take-short-2026-11-19.md`. `tests/take_survey_pick.py --score` reads seven-candidate captures
again (it had printed only its header since the eight-point grid).

**Not known.** All simulated, one seed a set. Whether real contacts are under 3 ms at all is unmeasured. A fresh set
with the instant clause written on advice, not on the rounded read, is the next test; M cannot count toward it.

## The ball hold on a wheel faster than told (2026-11-19, after "Short takes"; `LOOP_BALL_GAIN = "down"` on by its pre-registered rule)

**The item.** "A ball charged the integrator" left one cost of the ball hold: on 0.2 s wheels, ball undershoots over
2% went from 7 to 17 of 72, every one a wheel whose free speed is 11,000 rpm while the board is told
`WHEEL_RPM_FULL` 9,000. The plant is 1.22 times stiffer than the loop assumes, so the proportional term overshoots on
its own once the integrator is held.

**The change.** The integrator already knows the mismatch: at a steady wheel the command is (ff + i), so
(ff + i) / ff is the told free speed over the true one. `WheelLoop.ball()` now latches that ratio (clamped 0.5-1.0)
when the stroke starts and scales both gains by it until the ball hold ends. A wheel 22% faster than told gets gains
about 18% softer for its recovery; a wheel slower than told keeps the gains as told. Nothing changes outside a ball's
recovery, and a build whose `WHEEL_RPM_FULL` is measured sees a ratio of about 1 and no change at all.

**Two rules, both written before their runs** (`eval/ball-gain-rule-2026-11-19.md`; `tests/ball_gain_sweep.py`,
same trial as `tests/ball_recovery_sweep.py`, four plants each). Five clauses against the loop without it: undershoots
over 2% fall, mean time until the gate passes again no more than 0.05 s longer, no more balls over 3% off at the gate,
worst overshoot no more than 0.5 points higher, no case lost.

1. Scaling both ways (0.5-1.5) passed the 216-case development set (19 to 10 undershoots) and **failed** a 96-case
   held-out set, 13 to 15: wheels slower than told, given stiffer gains, undershot more (0.15 s at 7,500 rpm: 1 to 3).
   Kept off (`eval/ball-gain-sweep-2026-11-19.txt`).
2. Capped at 1 ("down"), judged on the development set and a fresh 96-case set fixed after the first outcome
   (eval/ball-gain-down-sweep-2026-11-19.txt); the first held-out set is reported, not judged:

| set | undershoot > 2%, off / down | worst undershoot | mean back to the gate | worst overshoot | > 3% at the gate |
| --- | --- | --- | --- | --- | --- |
| development, 216 | 19 / 9 | 4.5% / 3.6% | 0.89 / 0.89 s | 6.0% / 4.8% | 1 / 0 |
| fresh, 96 | 18 / 13 | 5.0% / 4.0% | 0.86 / 0.82 s | 6.4% / 5.4% | 0 / 0 |
| first held-out, 96 (not judged) | 13 / 13 | 4.6% / 3.8% | 0.73 / 0.71 s | 5.7% / 4.8% | 0 / 0 |

Every clause passed on both judged sets, so `LOOP_BALL_GAIN` ships as "down". On the fast wheels of the fresh set the
mean recovery fell 0.10-0.12 s (0.18 s wheel at 10,800 rpm: 0.93 to 0.83 s); the 0.8 s wheels at 11,000 rpm took
0.05 s longer on the development set, the one cell that got slower.

**Not known.** The simulator's first-order wheel and ESC, as before; the held-out sets vary the pairs, lags and free
speeds but not the ball model. What is left of the undershoot on the fastest wheels (10 of 24 cases at 0.15 s and
10,500 rpm still over 2%) is not the gain: measuring `WHEEL_RPM_FULL` on the build is still the fix. Test:
`test_ball_gain_softens_only_a_wheel_faster_than_told` (tests/test_host.py).

## A 432-case replication of the faster-than-told ball hold (2026-11-19, after "The ball hold on a wheel faster than told"; `LOOP_BALL_GAIN` unchanged)

**The item.** "down" was judged on the 216-case development grid and one 96-case fresh set; its first held-out set came
out 13 to 13. A second session built the same idea in parallel (kp scaled continuously in the hold, ki untouched,
`LOOP_BALL_KP_LEARN`, passed its own nine-clause rule) and found #17530 on `main` when it came to merge. It dropped its
copy and ran the shipped "down" on its unused grid instead.

**How it was checked.** `tests/ball_recovery_sweep.py --ball-gain off,down --heldout`: 432 cases (four plants, wheel
lags 0.15 / 0.25 / 0.3 s, free 8,000 / 10,000 / 10,500 / 12,000 rpm, nine pairs). #17530's five clauses, a prediction
and two identity checks were committed before the run (a0154030e). Everything is in `eval/ball-kp-learn-2026-11-19.md`.

| | False | "down" |
| --- | --- | --- |
| undershoots over 2%: all 432 / faster than told (324) | 126 / 122 | 76 / 72 (predicted 65-85) |
| gate passes again, mean / slowest | 0.817 / 2.78 s | 0.760 / 1.97 s |
| over 3% off at the gate / worst overshoot | 4 / 6.3% | 2 / 4.9% |

Every clause held. The 8,000 rpm rows came out identical, and so did the False rows against the session's earlier run.
The parallel kp-only design scored within a case of "down" everywhere (73 faster-than-told undershoots, 0.769 s), so
scaling ki as well buys little either way. **`LOOP_BALL_GAIN` stays "down".** 0.15 s wheels behind the 80 ms ESC
still dip (53 of 144 at 0.15 s), which is the ESC's lag.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/ball_recovery_sweep.py --band 0.005 --ball-gain off,down --heldout --rows rows.jsonl

## Short takes on a second held-out set (2026-11-19, after "Short takes: the fit sees them, the grid's end does not"; 1.5 and 2.5 ms in place of 2 by its pre-registered rule)

**The item.** On set M the grid 0, 1.5, 2.5, 3-8 ms failed only its instant-read clause, on a build the Pi would not
have advised. Does it pass a fresh set with that clause written on advice, decided before the capture?

**How it was checked.** Set N (wheel lag 0.62 s, seed 101; 66 drills, takes 0.2-2.75 ms at points M did not use,
3.3, 4.6, 7.4 ms as checks, and an instant build). The prediction and a four-clause rule (at least 4 more builds
within 0.5 ms, no more off by more than 1 ms, no more instant builds advised, checks no worse) were committed first
(7348979a6); a fail would have retired the candidate.

**What it found.** Within 0.5 ms 45 of 66 against 40, off by more than 1 ms 6 against 6, no instant build advised or
read off 0 on either, checks 16 each. Every clause held, so **`TAKE_SURVEY_GRID_US` is now 0, 1.5, 2.5, 3, 4, 5, 6,
7, 8 ms** (`controller.py`, `config.py`); `host.TAKE_SURVEY_MS` and `protocol.TAKE_SURVEY_TIMES` (9) follow, and the
Pi still decodes the eight- and seven-candidate frames of older boards. The prediction's "fewer large misses" did not
happen (6 each). Set N captured again with the new grid live on the board: 49 of 66 within 0.5 ms against the old
board's 39, large misses 3 against 7, checks 17 against 16.

**The cost.** One more refit a wheel. The Pi's 12 s hold a ball (`host.TAKE_WAIT_S`) cut the unit test's surveys
short, so it is now 14 s; on set N the balls were held 140.4 s a drill against 127.3 s (+10%), no survey cut. The
TAKE_SURVEY frame is 26 bytes. Everything is in `eval/take-short-n-2026-11-19.md`.

**Not known.** All simulated. Whether real contacts are under 3 ms is unmeasured. The large misses left are 1.4-1.9 ms
takes reading 0.

## Short takes that read 0: no ball saw them (2026-11-19, after "Short takes on a second held-out set"; the bound named in the Pi's advice by its pre-registered rule)

**The item.** Set N's large misses were 1.4-1.9 ms takes reading 0, put down to "the summed curve's shelf hides the
valley". NEXT.md asked for a check of those builds' curves before any new grid or pick.

**What the curves say.** `tests/take_shelf_bound.py --trace` on the stored dense refits (J to L, M, N): of the 17
builds at 1-2.5 ms off by more than 1 ms, 11 had no kept wheel whose fit at the true take beat the step's by 20% of
its squared rms, and 3 had one. There is no valley under the shelf. With one tach pulse a revolution, a take shorter
than a revolution moves a wheel's fit only when its contact straddles an edge ("Take-blind rows traced"), and those
builds' balls happened not to. Instant builds' curves are flat to 1.5-2.25 ms on 11 of 30, the same shape, so no grid
or pick can separate the two from those balls.

**What shipped.** What the balls do give is an upper bound: the first candidate whose mean rms is more than 2% over
the step's. When the Pi says TAKE_US = 0 it now names it (`host.take_survey_bound`, `TAKE_BOUND_TOL`): "these balls
cannot tell an instant take from one up to X ms ... more balls narrow it". Chosen on the five stored sets (145 of 145
told TAKE_US = 0 had the true take at most X), then held out on set O (lag 0.42 s, seed 109, 66 drills, committed
first in 020e567c9): 47 of 49 within the bound (95.9%, the rule asked 95%) and the bound at 1.5 ms on 4 of 6 instant
builds (half asked). Both held. The two misses were 2.0 ms takes at a 16-19 ppm step, where a whole ppm is 5-6%; a
ppm floor on the tolerance is NEXT.md's next test. Set O also had two 5 ms builds told "keep 0" (best fit only 9-22%
under the step's); they now read "up to 6 ms" and "up to 7 ms". No board number or verdict changed. Everything is in
`eval/take-bound-o-2026-11-19.md`.

## A ppm floor on the bound (2026-11-19, after "Short takes that read 0: no ball saw them"; shipped by its pre-registered rule)

**The item.** The TAKE_US = 0 bound held on set O by one build; both misses were 2.0 ms takes at a 16-19 ppm step,
where the frame's whole-ppm rounding is 5-6% and clears the 2% bar alone.

**What shipped.** A candidate now counts as worse than the step only when it is more than 2% and at least 2 ppm over
it (`host.TAKE_BOUND_FLOOR_PPM`). Chosen on J to L, M, N and O (2 ppm is the smallest floor covering all of O, at a
looser bound on 3 of 30 instant builds), rule committed in 881d6c775, then held out on set P (lag 0.58 s, seed 113,
66 drills): 48 of 48 builds told TAKE_US = 0 had the true take within the bound, against 46 of 48 at 2% alone, and the
bound stayed 1.5 ms on 4 of 6 instant builds. Five of P's bounds moved up 0.5-2.5 ms, none down. Above about 100 ppm
of step rms nothing changes. Everything is in `eval/take-bound-floor-p-2026-11-19.md`.

## More tach pulses a revolution (2026-11-19, after "A ppm floor on the bound"; tested host-side, closed by its pre-registered rule)

**The item.** With one magnet a revolution a take shorter than a revolution shows only on balls whose contact
straddles an edge ("Short takes that read 0"). Would two or four magnets multiply the balls that see a 1-2.5 ms take?

**What was built to ask.** `drop_from_commands_steps` takes `per` (periods a revolution) and `angles` (each period's
share of a revolution): spans stay the real times, each period's speed is its share over its time, and the window and
anchor stay counted in revolutions; `per=1` is the old fit exactly. `magnet_spacing` learns uneven magnets from a
steady stretch, each period over the mean of the revolutions either side of it (exact on a linear speed change).
`tests/tach_pulses_sweep.py` refits the same simulated ball with 1, 2 and 4 magnets (0.5 degree placement error, the
1/8 us capture tach, the take survey's depth), so the control is identical and only the tach differs; 256 balls.

**What it found.** Four magnets "saw" 46 of 128 short-take balls against 38 (the rule asked twice as many) and the
per-ball bound held on 81% (it asked 95%), so **the board keeps one pulse a revolution**. Instant balls read off 0
less often (7 of 32 against 16), and spacing must be learnt: taken as even, four magnets misfit by 1,500-3,200 ppm
and saw 1 ball. Not asked: the ball's least within 0.5 ms went from 51 to 116 of 224, mostly at 3-6 ms takes and high
speed, but the step's drop (TAKE_US = 0) got worse, 0.11% to 0.55% mean error (1.12% at 6,500 rpm), because short
periods resolve the take's shape. Not judged either: with 0.5 us of sensor jitter one magnet saw 9 short-take balls and four 24, with a 3.5 ms median
bound against none, so a jittery tach is where more magnets would pay. Everything is in
`eval/tach-pulses-2026-11-19.md`.

**Not known.** Point magnets on a first-order wheel; a real Hall edge's width and hysteresis would move each share
with speed. Reopening it needs a survey-level test written first and an answer for the step's drop.

