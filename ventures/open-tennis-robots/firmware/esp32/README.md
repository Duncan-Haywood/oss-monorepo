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
