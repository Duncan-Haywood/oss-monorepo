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
(0.1 ms units) and each candidate's mean rms. `host.run_drill(take_survey=True)` sends SURVEY_TAKE for a calibration
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
