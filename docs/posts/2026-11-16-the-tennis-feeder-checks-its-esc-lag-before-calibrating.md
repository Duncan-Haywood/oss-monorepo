---
title: "The tennis feeder now refuses a calibration drill on the wrong ESC lag"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "The open tennis feeder's board reports its ESC lag setting, and the Pi stops a calibration drill when it disagrees with the last survey."
---

The open tennis-ball feeder calibrates its launcher without a radar gun. Each
ball takes momentum from the two wheels, and the board fits each wheel's
speed drop to work out the launcher's speed and spin efficiencies. That fit
needs to know one thing about the build: how long the ESC takes to follow a
command. The board already measures that lag itself. After each ball it
refits every wheel at six candidate lags and reports which one fits best
([the survey](2026-11-16-why-the-tennis-feeders-spin-reading-was-off.md)).

The gap was what happened next. The survey printed one line at the end of a
drill: "set ESC_TAU_US = 79000 in config.py and re-flash". If nobody acted on
it, the next calibration drill ran anyway and wrote skewed drops to the shot
log, and the fit turned them into the numbers the planner aims with. The Pi
also had no way to see what the board was set to, so it gave the same advice
to a board that was already right.

**What changed.**

- The board now sends its setting with every telemetry frame. The extra frame
  is five bytes every 100 ms.
- The shot log keeps each drill's survey.
- Before the first ball of a drill marked as a calibration, the Pi compares
  the two. If the setting is more than 15% from the survey's pick (0 only
  matches 0), it stops before any wheel spins, prints the value to set and
  exits with code 4. It does not latch the e-stop.
- `--esc-lag-ok` overrides the check. Other drills only warn.
- `tennisbots esc-lag shots.jsonl` prints the advice on demand.

**How it did on the simulator.** I ran 72 simulated builds: six ESC models
(none, 30 to 150 ms of lag, one with tach jitter), three wheel lags, two
launchers, and a board left at 0 or set to a guessed 50 ms.

- Every board set more than 15% off its survey was held. Run anyway, those
  drills would have read spin up to 16.1% off.
- Two groups were let through: first-order builds left at 0, and a 60 ms ESC
  told 50 ms, which was within tolerance at 0.9% worst.
- After a re-flash to the survey's pick, no build was held, and the worst spin
  error was 1.9%.
- Some holds were cautious. An 80 ms ESC told 50 ms would have read 1.5% at
  worst, against 1.0% after the re-flash. A minute's re-flash is cheap next to
  a skewed calibration.

**What this does not show.** The wheels and ESCs here are the simulator's
first-order models, and the code has not run on a real ESP32 yet. A survey
logged before someone swaps an ESC is stale, and the check cannot tell. In
that case, run the rally drill again first.

Code, tests and the raw sweep: `ventures/open-tennis-robots`, in the firmware
README section "Checked before a calibration drill" and
`eval/esc-lag-check-sweep-2026-11-16.txt`.
