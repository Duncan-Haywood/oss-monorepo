# Open Tennis Robots: DIY tennis ball machine with a moving catch net, and a tennis ball pickup robot

Open-source hardware and software for two robots that make solo and coached
tennis practice better:

- **Feeder with a moving catch net.** A ball machine with a two-wheel
  launcher (topspin, backspin, programmable drills). It tracks your return
  with two cameras and slides sideways so its 3 m catch net is where the
  ball arrives. Caught balls roll back into the hopper and get fed again.
- **Ball-collecting rover.** A small robot, like a robot vacuum for tennis
  balls. It roams the court picking up balls while you practise with a ball
  machine or a coach, and stays out of keep-out zones around the player and
  the feeder.

**Try the shot planner and route demo in your browser:**
https://marisstella.app/open-tennis-robots/

Everything is MIT-licensed. You can build it, change it, and **sell it**
under your own brand ([seller's guide](sell/README.md), including a
one-command Amazon listing tool).

## Manufacture it

**The collector is ready to manufacture.** A parametric CAD model in code
([`cad/`](cad/README.md), build123d) generates the whole fab package. It
is committed at
[`manufacturing/collector-package.zip`](manufacturing/collector-package.zip),
or [browse it](manufacturing/collector/) (GitHub renders the STLs in 3D):

- `laser/*.dxf`: laser or waterjet cutting, flat 5052 aluminium, no bends
  or tapped holes
- `print/*.stl`: PETG printed parts
- `step/*.step`: every part, plus the assembly, for any CAD or CAM tool
- `bom.csv` (every part and fastener), `cut_list.csv` and assembly drawings

Every build checks for part-to-part collisions, bolt-hole alignment, ground
contact and design rules, and is byte-reproducible. CI fails if the
committed package goes stale.

**The feeder has a first package too** ([`manufacturing/feeder-package.zip`](manufacturing/feeder-package.zip),
[browse](manufacturing/feeder/)): launcher head plates, trunnion cheeks and
turntable, the 2040 base with drive and idler brackets, mast, 3 m net beam,
net poles, elbows and a stereo camera bar. Its build also tilts the head
through its whole elevation range to check it never hits the mast, and
sizes the ballast the net needs against wind. The feed is modelled too: a
hopper tub on a sloped shelf and four posts, a hose to the head, and a printed
shuttle that meters one ball at a time to the wheels. The azimuth drive is modelled
(a NEMA 17 and a printed gear sector, sized from the CAD's own turning
inertia), and the head is checked for collisions turned as well as tilted.
The elevation drive is modelled too (2026-11-11): a 150 mm-stroke linear
actuator outboard of the guard-side cheek, sized on the head's gravity moment
measured from the CAD, and the firmware drives it the same day: SET_AIM's angle
becomes an actuator length through the CAD's own geometry (a straight servo
mapping would aim up to 1.46 deg high), from a feedback pot, an RC-input
actuator or timing off the retract limit, and the feed gate waits until the aim
has arrived ([`firmware/esp32/README.md`](firmware/esp32/README.md), "Elevation
actuator"). The shuttle's drive is modelled too (2026-11-11): a servo turns a
crank outboard of the motor plate, and a rod reaches the shuttle through a slot
in the plate. Sizing it showed the 100 mm linear actuator the BOM had listed
would need about 9.7 s a ball at 20 mm/s; the servo crank takes about 1.7 s
under the assumed loads. The firmware's 150 ms gate pulse could not have moved
either one, and it counted a ball as fed when the gate opened, so the Pi could
re-aim while the ball was still on its way. Both are fixed and the simulated
board now catches them ([`cad/README.md`](cad/README.md), "Shuttle drive").
Catch trough (2026-11-13): gutter runs, hangers and a sump are CAD, and showed
the recycle loop was open: balls reach the sump about 2.2 m below the tub's rim
([`cad/README.md`](cad/README.md), "Catch trough"). Ball lift (2026-11-13): a
cleated belt in a column beside the mast now carries them up and drops them
into the tub, about 53 a minute on paper, and the firmware runs it for 16 s
after each ball fed ([`cad/README.md`](cad/README.md), "Ball lift"); since
2026-11-15 a shunt and comparator on GPIO 0 let it cut a jammed lift within
about 30-90 ms, retry once and then report `FLAG_LIFT_JAM`
([`cad/README.md`](cad/README.md), "Lift jam cutoff"; its shunt sits inside the
motor-diode loop behind an INA186-class amplifier, so the trip, 1.51-1.77 A,
no longer rises when the firmware turns the duty down on a full pack: "Lift
current sense inside the diode loop"), and a friction slip hub
on the drive pulley keeps the jam's first impact on a flight to 51-88 N on the
simulated feeder, against 98-214 N with the pulley keyed to the shaft
([`cad/README.md`](cad/README.md), "Lift slip coupling"). Hopper
agitator (2026-11-13): a two-arm stirrer on a small gearmotor sweeps over the
tub's outlet at a ball's centre height while balls are being fed, so balls
bridging the outlet cannot leave the feed column empty
([`cad/README.md`](cad/README.md), "Hopper agitator"). Not yet modelled: the
netting.

> **Status:** the collector is design v0.2 with a complete package; the
> feeder is a v0.1 design. The physics, planners, tracker and firmware
> logic are tested in simulation. No robot has been built yet. Builders:
> please open issues with what you find.

## What's here

| Path | What it is |
| --- | --- |
| [`hardware/feeder-catcher.md`](hardware/feeder-catcher.md) | Feeder + catch net design: dimensions, mechanism, sensing, open questions |
| [`hardware/collector.md`](hardware/collector.md) | Collector rover design: pickup roller, drive, localisation |
| [`hardware/electronics.md`](hardware/electronics.md) | Block diagram, ESP32 pin maps, power budget, wiring |
| [`hardware/safety.md`](hardware/safety.md) | Safety features and the builder's responsibilities |
| [`hardware/bom-*.csv`](hardware/) | Bills of materials (rough cost estimates: ~$1,200 feeder, ~$700 collector) |
| [`src/tennisbots/`](src/tennisbots/) | Python package for the Raspberry Pi: flight model, launcher aiming, tracker, catch planner, collector routing, path following, vision, serial protocol, listing tool |
| [`firmware/esp32/`](firmware/esp32/README.md) | MicroPython motor-control firmware with watchdog, e-stop and bumper logic |
| [`cad/`](cad/README.md), [`manufacturing/`](manufacturing/) | Parametric CAD (build123d) and the generated fab packages (DXF, STL, STEP, BOM, drawings) |
| [`sell/`](sell/README.md) | How to sell builds legally, and the Amazon listing tool |
| `index.html`, `sim.mjs` | The browser simulator (a port of the Python model, tested against it) |

## Quick start (software)

```
pip install "git+https://github.com/duncan-haywood/oss-monorepo#subdirectory=ventures/open-tennis-robots"

# Where to aim, and how fast to spin each wheel, to land a 79 km/h topspin ball 9 m past the net:
tennisbots aim --x 9 --y -2 --speed 22 --topspin 1200

# Compile a drill into machine settings (fails loudly on any unreachable ball):
tennisbots drill drill.example.json

# Size the catch net: simulate returns with camera noise and latency:
tennisbots catch-study --net-width 2 --net-width 3 --base-speed 0 --base-speed 2.5

# Plan the collector's route around a practice session's keep-out zones:
tennisbots collect --balls 60 --practice

# On the feeder's Raspberry Pi: run a drill on the machine over its serial port
pip install "tennisbots[serial]"   # or pip install pyserial
tennisbots run drill.example.json --port /dev/ttyAMA0
```

Coordinates are metres. The origin is the centre of the net, x points
toward the player, and y points to the machine's left.

## What the simulation says about the catch net

300 simulated club-level returns per cell: struck from the player's back
court at 50-100 km/h with 0-2,500 rpm topspin, landing in the singles
court. The model has 120 fps cameras with 5 cm noise, 100 ms latency and
5 m/s² base acceleration (`tennisbots catch-study`, seed 1). The table
shows the share of returns caught:

| Net width | Fixed net | Base 1 m/s | Base 2.5 m/s | Base 4 m/s |
| --- | ---: | ---: | ---: | ---: |
| 1.5 m | 19% | 45% | 80% | 91% |
| 2.0 m | 23% | 50% | 84% | 94% |
| 3.0 m | 31% | 64% | 91% | 97% |
| 4.0 m | 46% | 79% | 96% | 99% |

Read it as:

- **Moving matters more than size.** A fixed 3 m net catches about a third
  of returns. The same net on a 2.5 m/s base catches about nine in ten.
- **Speed keeps paying past 2.5 m/s**, so the drive is worth more effort
  than a wider net.
- No simulated return cleared a 2.5 m frame.

These are simulation results under stated assumptions, not measurements.
The return distribution (`catcher.ReturnDistribution`) is a guess at a
club player, and the first real build should measure it.

## How the pieces fit

```
cameras ──> vision.detect_balls ──> triangulate ──> tracker.BallTracker ──┐
                                                                        v
drill.json ──> launcher.aim ──> wheel rpm, angles      catcher.plan (crossing of net plane)
                     │                                                  │
                     └────────────> protocol.encode ──UART──> ESP32 <───┘
                                                         (controller.py: limits, watchdog, e-stop)
collector camera ──> vision.Homography ──> collector.Planner ──> drive.PurePursuit ──> ESP32
```

## Running a drill on the machine (2026-11-11)

`tennisbots run` (`src/tennisbots/host.py`) is the loop between the planner and
the ESP32. It plans every shot first, so an unreachable ball fails before a
wheel turns; then, per shot, it sends the wheel speeds and the aim, waits for a
telemetry frame that is certainly newer than the command (0.25 s, since a frame
can be in flight) showing the aim arrived (`FLAG_AIM_SETTLING` clear, azimuth
homed) and the wheels held at speed (`FLAG_WHEELS_SETTLING` clear), sends
`FEED 1`, and waits until the firmware's released-ball counter (a new last byte
of `TELEMETRY`) moves. Only then does it re-aim, so a queued ball can never ride
a re-aim to the wrong place; the next ball goes no sooner than the drill's
`interval` (default 3 s, per shot or per drill) after the last one. Heartbeats
go out every 100 ms. An e-stop, watchdog or elevation fault, a silent link, or
a step over its time limit aborts: the runner sends `ESTOP` (which also drops a
queued ball) and says why.

It is tested against the firmware itself: `tests/feeder_sim.py` runs
`controller.py` and `main.py`'s `FeederHw` on stand-in `machine` and `time`
modules, with invented physics (each wheel a first-order lag, the turntable
following its step pulses, the actuator at its configured speeds or read
through its pot). On that board `drill.example.json` runs clean in pot and
timed elevation modes: four balls, each released within 0.6 deg of its planned
elevation, 0.05 deg of its azimuth and 3.5% of both wheel speeds, at least 3 s
apart. E-stop pressed mid-drill, a lost `FEED` frame, a pot wire coming off and
a silent board each abort with no further ball. No real board has run it.

**An empty tub (2026-11-16).** The firmware judges every feed stroke by the
launcher wheels' speed drop, since a ball takes its momentum from them (8.8% per
wheel on a flat shot with the CAD's figures) and an empty pocket leaves them
steady. A dry stroke sets `FLAG_HOPPER_EMPTY`; the runner stops there, names the
shot that went dry and how many flew, stops the wheels without latching the
e-stop, and exits 3. No sensor was added because the feeder's ESP32 has no pin
left for one. The drop is measured from the wheel's own speed when the ball met
it, not its target: a stroke fed as the speed gate opens starts with the wheel
still closing on its target, and against the target 29 of 972 such simulated
strokes were judged wrong (none now). Margins over 27 simulated builds and the
reasoning: [`firmware/esp32/README.md`](firmware/esp32/README.md), "Empty
hopper" and "The verdict from the pre-ball speed".

**A shot log and a launcher fit without a radar gun (2026-11-16).** The same
drop is the ball's momentum, so every judged stroke now reaches the Pi as a
`LAUNCH` record (each wheel's speed before the ball and its drop).
`tennisbots run drill.calibration.json --shot-log shots.jsonl` logs them and
`tennisbots fit-launcher shots.jsonl` fits the launcher's speed and spin
efficiencies, the numbers the planner aims with. On 18 simulated builds the
speed efficiency came within 3.9% (10.9% if the drops are read naively) and
the spin efficiency within 11.7%; one radar session pins the wheel's inertia.
Later that day, the firmware began fitting each drop to the wheel's pulse times
instead of reading only the lowest revolution, which shows 62-99.5% of the
drop. The fit came within 1.9% (speed) and 6.6% (spin), and it no longer
needs the speed loop's recovery time. Later still, the board fits each drop
with the speed loop's own logged ESC commands driving a first-order wheel
instead of a free parabola: each drop within 0.3% (sd) of the simulator's,
and the calibration drill's spin efficiency within 1.6% on 18 builds and 1.9%
on 12 held-out ones (8.1% and 7.8% before). That is the method's best case,
since the simulated wheel is that model; a real wheel's log is the next check.
Since 2026-11-16 the board reports the ESC lag its fit runs with, the shot log
keeps each drill's ESC-lag survey, and `tennisbots run` stops a calibration
drill before its first ball when the two disagree (exit 4, the value to set;
`--esc-lag-ok` overrides it). `tennisbots esc-lag shots.jsonl` prints the last
survey's advice. On 72 simulated builds, every board set more than 15% off its
survey was held, and none was held after a re-flash to the pick (worst spin error
1.9%, against up to 16.1% if run anyway): firmware/esp32/README.md, "Checked
before a calibration drill".

Before trusting the contact-time survey, log one wheel's tach spinning steadily
(`firmware/esp32/tach_log.py` from the ESP32's REPL) and run `tennisbots
tach-jitter periods.txt`: it prints the tach's edge jitter and whether the survey
can see through it. On the simulator the survey named and advised 14 of 18 spread
contact times on a clean tach and none of 54 from 1.5 us of jitter, going quiet
rather than wrong (firmware/esp32/README.md, "The take survey's jitter limit").
[`firmware/esp32/README.md`](firmware/esp32/README.md), "Shot log", "The
drop from the pulse times" and "A recovery shaped by the loop's own commands".

**A drill that re-aims itself from its own shots (2026-11-16).** `tennisbots
run drill.json --shot-log shots.jsonl --refit-after 4` fits the launcher from
the drill's own wheel speed drops every 4 shots and re-plans the remaining
shots' wheel speeds, printing how far they would have landed off. On 12
simulated builds whose launcher differed from the planner's default, shots 5
to 16 landed up to 5.2 m off unchanged and at most 0.74 m off re-planned
(1.2 m before the pulse-time drops); the
planner also now refuses a wheel under 500 rpm, where the simulated wheel
never settled.
[`firmware/esp32/README.md`](firmware/esp32/README.md), "Re-planning a drill from its own shots".

### Wheel speed loop (2026-11-11)

Writing the runner turned up two faults in the launcher wheels' firmware:

- **The tachometer could not read the speeds it gates on.** It counted the
  once-per-rev pulses in each 10 ms tick and scaled by 60000/dt, so its only
  readings were 0, 6000, 12000 rpm...: a 3000 rpm wheel read 0 and 6000 in
  turn. It now times each revolution (`controller.PeriodTach`, the mean of the
  last four periods from a microsecond clock, the open period while the wheel
  slows, 0 after 250 ms without a pulse, glitches faster than 12000 rpm folded
  into their revolution).
- **The speed loop was integral only** (`cmd += err x 2e-6 x dt`). With the new
  tachometer, on the simulated board the bottom wheel at 1955 rpm swung
  between about 1200 and 2900 rpm for ten seconds, and the gate's single 5%
  reading let balls go mid-swing (one left at 1591 rpm, 19% slow). It is now
  feedforward from the wheel's free speed (`WHEEL_RPM_FULL` in `config.py`;
  measure it) plus PI with anti-wind-up (`controller.WheelLoop`), and the gate
  wants both wheels held within 3% for 150 ms (`controller.SteadyGate`).

`tests/wheel_loop_sweep.py` checks the loop over 36 cases: free speed 7000,
9000 and 11000 rpm while the firmware is told 9000, spin-up time constants
0.2, 0.4 and 0.8 s, and the drill's wheel pairs. All 36 reach steady within
2.6 s. A 5% gate let balls go at up to 6.6% true speed error, because the
tachometer's average trails the wheel; the 3% gate holds that to 2.8%
(median 1.6%) for at most 0.6 s more spin-up. In the flight model a 22 m/s
ball aimed 9.5 m out lands 0.7 m off at 2.8% and 1.7 m off at 6.6%. The
wheel model is an assumption; the first build should log its tach readings
during a spin-up and rerun the sweep with the measured lag.

### Spin-up ramp and the battery's limit (2026-11-14)

The power model added to the CAD this day (`cad/README.md`, "Power
distribution") found that the speed loop's feedforward stepped each ESC's
throttle the moment a new speed arrived. A wheel starting from rest could then
draw the motor's peak, about 1 kW, from the battery: 49 A per ESC at 24 V, 98 A
for both, against a 20 Ah pack whose BMS allows about 30 A continuous
(assumed). A BMS that cuts out takes the Pi and the ESP32 down with it. The
firmware now moves each wheel's target along a ramp (`controller.SpinupRamp`):
at most `WHEEL_RAMP_MAX_RPM_S` (1,500 rpm/s) at low speed, then at a constant
`WHEEL_SPINUP_W` (100 W) of shaft power, using the wheel's inertia
(`WHEEL_INERTIA_KGM2`, from an assumed 0.40 kg wheel). Stopping is not ramped.
A test checks the three numbers against the CAD.

`tests/spinup_ramp_sweep.py` measures it on the simulated feeder (27 cases: three
wheel pairs, three plants). With no ramp, the median per-wheel peak was 871 W.
The simulated plant has no current limit, so its worst case (2,643 W) means
nothing for a real motor. With a 6,000 rpm/s low-speed cap the peak was still
436 W. The once-per-rev tachometer reads 0 for the first revolutions, so the
loop's proportional term pushed the wheel past its ramp. At 1,500 rpm/s the
worst peak is 110 W for a 100 W cap. The cost is a slower start from rest:
steady in 4.9 s at worst (2.4 s before), and 4.8 s to the drill's fastest wheel
speed by the CAD's integral. A drill pays that once, because a speed change
between shots is a fraction of it. Not measured: the real motor's current
during a ramp, and the loop's recovery after each ball, which is why the ESC
fuses are twice the ramped draw.

Closing the e-stop contactor is the other surge (2026-11-14). It joins the
pack straight to the ESCs' empty input capacitors, so the loop's few tens of
milliohms are the only limit. On assumed figures a direct close peaks near
394 A, 13 times the contactor's rating, and across a 27-case sweep
(`tests/inrush_sweep.py`) it outlasts an assumed BMS short-circuit delay in 9
cases. The feeder now precharges the bus through a 4.7 ohm resistor and relay
and closes the contactor 0.5 s later through an on-delay timer, all fed
through the e-stop; the contactor then makes about 20 A
(`cad/README.md`, "Contactor inrush and precharge";
`hardware/electronics.md`).

That 20 A assumed the switched loads idle while the bus charges (also
2026-11-14). A buck or a stepper driver draws constant power once it starts,
and the resistor passes at most 30 W at 24 V. The firmware used to pulse the
shuttle servo from power-up, so after an e-stop mid-stroke it would seek home
at stall during the precharge: on assumed figures that holds the bus near 8 V
and the contactor makes about 223 A. The servo now gets no pulse until the
first FEED, which runs a back stroke first, and rests unpowered at the crank's
dead centres between feeds (`cad/README.md`, "Start-up loads during the
precharge").

The stepper driver held its current from power-up too, because its ENABLE was
tied to ground, and that alone made the contactor take about 45 A. Since
2026-11-14 its ENABLE is on a pin with a pull-up, and an optocoupler across
the contactor's coil tells the ESP32 when the coil is on; the firmware enables
the driver only after the coil has been on for 150 ms, longer than the
contactor's assumed pull-in and bounce. The contactor now makes about 20 A
(12 to 29 A across the sweep, none over the assumed 60 A). The same sense line
catches a wireless e-stop the board could not see before: the board halts,
drops any queued ball and re-homes the azimuth, and the Pi's drill runner
aborts on the new `FLAG_BUS_OFF` (`cad/README.md`, "Stepper ENABLE after the
contactor, and contact bounce").

Also fixed: `launcher.aim` crashed with `AttributeError` on a shot too fast to
land on its target (80 m/s), because its bisection closed on the jump between
"hits the net" and "lands long"; it now raises the `ValueError` its callers
handle.

## Develop

```
cd ventures/open-tennis-robots
PYTHONPATH=src python3 -m unittest discover -s tests   # Python: physics, planners, firmware logic, drill runner, listing
PYTHONPATH=src python3 tests/wheel_loop_sweep.py       # wheel speed loop over plant assumptions
node --test *.test.mjs                                 # browser port vs Python fixtures, page checks
PYTHONPATH=src python3 -m tennisbots.fixtures          # regenerate fixtures after changing the model
```

## Roadmap (long-term project)

1. **Build the collector first** from the manufacturing package. It is
   simpler, cheaper and safer, and it tests the vision, localisation and
   drive stack.
2. **Feeder CAD**: launcher head, lateral base, mast and catch-net frame are
   in `manufacturing/feeder/` (v0.1), with the hopper, hose and feed shuttle.
   The trough, the ball lift to the tub and the hopper agitator landed 2026-11-13. The azimuth drive
   landed 2026-11-10, and the elevation drive and the shuttle's servo crank landed 2026-11-11. The hose and its sliding-sleeve take-up are
   checked over the head's whole tilt and turn range (2026-11-10).
3. Bench-test the feeder head: calibrate wheel efficiencies
   (`launcher.calibrate`) with a radar gun, then validate the flight model
   against real landing spots.
4. Build the stereo tracker on a tripod and record real returns. That
   gives a measured `ReturnDistribution` to replace the guess.
5. Build the moving base and net. Compare the measured catch rate with the
   simulation.
6. Phone app for drills (Web Bluetooth or a local web server on the Pi).
7. Spin estimation from longer tracks, to cut prediction error on topspin
   returns (the main error source; see `tests/test_robots.py`).
8. UWB or line-based localisation for the collector on unlit courts.
9. An illustrated assembly guide and a kit for sellers.

### Known gaps (quality audit, 2026-11-08)

The [2026-11-08 audit](../../portfolio/quality/audits/2026-11-08-open-tennis-robots.json)
found the catch-net geometry, the lift constant and the README's headline
catch rate untested, and the base target unclamped in firmware. Both were
fixed on 2026-11-14: tests now pin the catch window, hand-computed drag and
Magnus accelerations, exact study counts and the README's 3.0 m / 2.5 m/s
cell (274 of 300), and `SET_BASE` clamps the target to the +/- 4.0 m rail.
Still open:

- **The feed interlock** (wheels within 5% of target before a ball is
  released) lives only in the board layer, `firmware/esp32/main.py`, which
  no test drives; `safety.md` relies on it.
- **E-stop reset** takes the button released plus a `CLEAR_ESTOP` from the
  Pi. That is a separate reset after release, but it can come from a phone
  or script away from the machine; a reset at the machine (a button on the
  feeder that must be pressed after release) is the safer design.

## Safety, warranty, privacy

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not engineering or safety advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for building
and operating any machine safely and lawfully. To the maximum extent
permitted by law, the authors accept no liability for any loss, damage or
injury arising from its use. Read [`hardware/safety.md`](hardware/safety.md)
before building.

**Best-effort hosting, no SLA.** The web page is free and experimental and
may move or go offline without notice. Clone the repository to keep a copy.

**Privacy.** The web page runs entirely in your browser. Nothing is
uploaded, and there are no accounts, cookies or analytics vendor. Anonymous
feature counts stay in your browser's local storage and can be switched
off on the page. The CLI sends nothing anywhere. The exception is
`tennisbots listing types|submit --validate|--live`, which calls Amazon's
API with the seller's own credentials.

Not affiliated with any ball machine maker, tennis brand, or Amazon.
Sponsor the work: https://github.com/sponsors/Duncan-Haywood
