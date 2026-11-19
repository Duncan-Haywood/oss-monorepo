---
title: "A tennis drill builder that knows what the ball machine can do, and how long it needs between balls"
seo_title: "Tennis ball machine drill builder: reach, wheel limits and timing"
date: 2026-11-18
tags: [open-tennis-robots, tennis, ball-machine, simulation, tools]
description: "Open Tennis Robots' page now builds drills: every ball checked against the machine, the time it needs between balls estimated, and a drill.json to run."
---

A ball machine drill is a list of balls: where each lands, how fast, how much
spin, and how long the player gets before the next one. Writing that list is
easy. Knowing whether the machine can actually play it is not, and on a
two-wheel machine the answer is often "not at that pace".

The [Open Tennis Robots page](https://marisstella.app/open-tennis-robots/#drills)
now has a drill builder. Tap the court to add balls, edit the speed, spin and
pause of each, or start from five ready-made drills. Every ball is checked the
way the machine's own drill runner (`tennisbots run`) checks it: the same flight
model with drag, spin lift and the net, the head's range (15 degrees down to 45
up, 30 either side, which the firmware clamps to), and the wheels' 500 to 7,000
rpm window. Then **Save drill.json** gives you the file the feeder's Raspberry Pi
runs, and **Copy share link** puts the whole drill in the link's `#fragment`, so
a coach can send a session to a player without anything reaching a server.

## How long the machine needs between balls

The builder also estimates how soon after one ball leaves the machine can feed
the next, from the firmware's own settings:

- the feed shuttle's back stroke (0.85 s);
- the turntable turning to the next ball's direction (60 deg/s peak, 120 deg/s²);
- the elevation actuator travelling to the next angle, through the head's real
  lever geometry and the firmware's position loop, which slows over the last
  12.5 mm;
- the two wheels changing speed under the firmware's 100 W ramp (a jump from
  2,160 to 5,531 rpm on the top wheel takes about 2.5 s of ramp alone);
- and the runner's wait, after a ball off a slow wheel, for that ball's launch
  check.

A pause more than 0.3 s shorter than the estimate is marked "may run late".
The machine never feeds early, so such a drill does not fail; it just runs
slower than you wrote it.

## Checked against the firmware on a simulated machine

The repository has a simulated feeder that runs the real ESP32 firmware and the
real drill runner. Forcing every pause to 0.1 s makes the machine set the pace,
so the time between releases is what the estimate should predict:

| Drills | Gaps | Estimate minus simulator, mean | Range | Within 0.3 s |
|---|---|---|---|---|
| The five presets | 33 | +0.20 s | −0.11 to +0.81 s | 26 |
| Six random drills, written after the model | 42 | +0.23 s | −0.34 to +0.65 s | 25 |

The first run was worse, and taught two things. A flat 9 degrees a second for
the tilt read up to 0.9 s short, because the position loop slows the actuator
near its target. Leaving out the board's six-revolution steady check before each
stroke read every gap a little short. Both are in the shipped estimate.

What is left runs long, mostly on big wheel-speed changes: the board's speed
loop follows the ramp more closely than a plain 0.4 s wheel lag. A 0.25 s lag
would centre the estimate on these drills, but that would be tuning to a
simulator whose wheel physics is an assumption itself, so the estimate keeps
the simulator's own figure and leans conservative. One honest consequence: the
repository's own example drill gets one "may run late" mark at 3 s, on a ball
that needs the top wheel 3,400 rpm faster; the simulator plays it on time,
about 0.6 s inside the estimate. None of this has been measured on a built
machine; no Open Tennis Robots feeder exists yet.

## A crash found on the way

Testing balls at the edge of the court turned up a bug in the page's existing
shot planner. The Python aimer learned on 11 November that a search bracket can
span a jump instead of a crossing: just below it the ball hits the net, just
above it the ball lands past the target. The browser copy never got that check,
so a short, fast ball across the court from a machine standing 4 m to one side
showed "Cannot read properties of undefined". It now says the target cannot be
reached at that speed and suggests slowing the shot or adding topspin, the same
message as the Python, and a test pins three such shots.

The code is `drill.mjs` and `drill.test.mjs` in
[ventures/open-tennis-robots](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/open-tennis-robots),
MIT-licensed; the simulator comparison is `tests/drill_gap_check.py` and its
output is in `eval/drill-gap-check-2026-11-18.txt`. Still open: sending a drill
from the page straight to the machine instead of saving a file. This is a design
and a simulation, not engineering or safety advice; a ball machine can hurt
people, and building and running one safely is the builder's job.
