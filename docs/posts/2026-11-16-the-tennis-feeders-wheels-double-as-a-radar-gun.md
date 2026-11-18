---
title: "The tennis feeder's wheels double as a radar gun"
seo_title: "Calibrating a ball launcher from its wheel speed drops"
date: 2026-11-16
tags: [open-tennis-robots, firmware, calibration]
description: "Each ball takes its momentum from the launcher wheels, so their speed drop gives its exit speed. A shot log now calibrates the launcher with no radar gun."
---

The open tennis-ball feeder aims every shot with two numbers: how much of the
wheels' surface speed the ball leaves with, and how much of their speed
difference turns into spin. Until today the only way to measure them was a
radar gun and slow-motion video. Get the speed figure 5% wrong and a deep
groundstroke lands about a metre short.

Earlier today the firmware learned to notice an empty hopper by how much the
launcher wheels slow when a ball goes through. That drop is the ball's
momentum. The two wheels' pushes add up to the ball's linear momentum, and
their difference gives its spin. So with the wheel's inertia known, the drops
tell you the exit speed and the spin.

**What landed.** Every feed stroke the firmware judges now leaves a record:
each wheel's speed just before the ball, how far each one fell, and whether a
ball went. The board sends it to the Pi with every telemetry frame until the
next stroke. `tennisbots run drill.calibration.json --shot-log shots.jsonl`
logs a 12-shot drill made for this, and `tennisbots fit-launcher shots.jsonl`
prints the two efficiencies as a block the drill files take.

**Two mistakes the simulator caught.** The first version measured each drop
from the wheel's target speed. But the feeder lets a wheel sit anywhere within
3% of target, and against an 8.8% drop that offset moved readings by up to
30%. The drop now comes from the wheel's own speed in the 2.5 revolutions
before the ball. The second mistake was keeping that history as the last
three readings. A slowed wheel's next pulse arrives late, and the tach reports
a falling half-revolution on every 10 ms tick. Those readings pushed the
pre-ball speed out of the history, and at 1,500 rpm a drop read a third of
its size.

**The tach misses part of each drop.** It reports the slowest single
revolution, and the speed loop is already pulling the wheel back during that
revolution. On the simulator it saw 78% of the drop at 1,500 rpm with a fast
loop and 97% at 6,500. The fit models that share from the revolution's length
and the loop's recovery time, and fits the recovery time too when the log
covers a range of speeds.

**How close, on the simulator.** Across 18 simulated builds with true
efficiencies the planner didn't know, the fit got the speed efficiency within
3.9% and the spin efficiency within 11.7%. Reading the drops naively, without
the recovery model, was off by up to 10.9%. Run through the Pi's real drill
loop, three builds came within 2.3% to 4.4%.

**What it can't do alone.** The drops measure efficiency divided by the
wheel's inertia, and the inertia is still the CAD's figure, not a weighed
wheel. One radar session settles it: `fit-launcher --radar-speed-eff` turns
that one reading into the true inertia. After that, every drill keeps the
calibration current for free, as the wheels' felt wears or a softer batch of
balls comes in.

None of this has met a real wheel yet. The simulator's wheels are simple
first-order lags and each ball's momentum leaves in one instant, and a real
ESC may recover differently. The first build's check is a calibration drill
logged next to a radar gun. Details and every number:
`ventures/open-tennis-robots/firmware/esp32/README.md`, "Shot log".
