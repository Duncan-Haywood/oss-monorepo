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
https://duncan-haywood.github.io/monorepo-projects/open-tennis-robots/

Everything is MIT-licensed. You can build it, change it, and **sell it**
under your own brand ([seller's guide](sell/README.md), including a
one-command Amazon listing tool).

> **Status: design v0.1.** The physics, planners, tracker and firmware logic
> are written and tested in simulation (50+ automated tests). No robot has
> been built yet. Builders: please open issues with what you find.

## What's here

| Path | What it is |
| --- | --- |
| [`hardware/feeder-catcher.md`](hardware/feeder-catcher.md) | Feeder + catch net design: dimensions, mechanism, sensing, open questions |
| [`hardware/collector.md`](hardware/collector.md) | Collector rover design: pickup roller, drive, localisation |
| [`hardware/electronics.md`](hardware/electronics.md) | Block diagram, ESP32 pin maps, power budget, wiring |
| [`hardware/safety.md`](hardware/safety.md) | Safety features and the builder's responsibilities |
| [`hardware/bom-*.csv`](hardware/) | Bills of materials (rough cost estimates: ~$1,200 feeder, ~$600 collector) |
| [`src/tennisbots/`](src/tennisbots/) | Python package for the Raspberry Pi: flight model, launcher aiming, tracker, catch planner, collector routing, path following, vision, serial protocol, listing tool |
| [`firmware/esp32/`](firmware/esp32/README.md) | MicroPython motor-control firmware with watchdog, e-stop and bumper logic |
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

## Develop

```
cd ventures/open-tennis-robots
PYTHONPATH=src python3 -m unittest discover -s tests   # Python: physics, planners, firmware logic, listing
node --test *.test.mjs                                 # browser port vs Python fixtures, page checks
PYTHONPATH=src python3 -m tennisbots.fixtures          # regenerate fixtures after changing the model
```

## Roadmap (long-term project)

1. **Build the collector first.** It is simpler, cheaper and safer, and it
   tests the vision, localisation and drive stack.
2. Bench-test the feeder head: calibrate wheel efficiencies
   (`launcher.calibrate`) with a radar gun, then validate the flight model
   against real landing spots.
3. Build the stereo tracker on a tripod and record real returns. That
   gives a measured `ReturnDistribution` to replace the guess.
4. Build the moving base and net. Compare the measured catch rate with the
   simulation.
5. Phone app for drills (Web Bluetooth or a local web server on the Pi).
6. Spin estimation from longer tracks, to cut prediction error on topspin
   returns (the main error source; see `tests/test_robots.py`).
7. UWB or line-based localisation for the collector on unlit courts.
8. A kit for sellers: laser-cut/printed part files and an assembly guide.

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
