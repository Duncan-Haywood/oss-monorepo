---
title: "The tennis feeder corrects its own aim mid-drill"
seo_title: "Re-planning a ball machine's wheel speeds from its own shots"
date: 2026-11-16
tags: [open-tennis-robots, firmware, calibration]
description: "Every four shots the feeder now refits its launcher from the wheels' speed drops and re-plans the rest of the drill. Simulated misses fell from 5.2 m to 1.2 m."
---

Earlier today the open tennis-ball feeder learned to read its launcher's
efficiencies from how much its wheels slow when a ball goes through. That gave
a calibration with no radar gun, but the number only reached a drill if
someone ran a separate command and pasted the result into the drill file.

Now the drill does it itself. `tennisbots run drill.json --refit-after 4` fits
the launcher to the drill's own shots every four balls and re-plans the wheel
speeds of the shots still to come. The aim doesn't move, because it depends
only on the ball's speed and spin, and the drill fixes those. Each time it
re-plans, it prints how far the remaining shots would have landed from their
targets on the old speeds.

## What the simulator showed

We ran a 16-shot groundstroke drill on 12 simulated builds whose true launcher
differed from the planner's default. On the planner's numbers alone the shots
landed up to 5.2 m from their targets. Re-planned after the fourth shot, shots
5 to 16 landed at most 1.2 m off, and every build improved.

Three things went wrong first, and each is worth knowing if you build a
feedback loop like this:

- **The first version made good builds worse.** A four-shot fit reads the
  speed efficiency about 3% off. Adopting every change over 2% moved builds
  that were nearly right from 0.6 m off to 0.9 m off. Now each efficiency only
  changes when the fit moves it further than the fit's own measured error. On
  those builds the misses fell to between 0.01 and 0.24 m.
- **It was one shot late.** A shot's record arrives a quarter second after the
  ball leaves, and the runner was already re-aiming by then. It now waits for
  that record first.
- **The fit asked for a wheel the machine can't hold.** A low spin efficiency
  led to a bottom wheel at 263 rpm. The simulated wheel never settled there, so
  the drill timed out. The planner used to accept any speed down to zero. It
  now refuses anything under 500 rpm, and the re-planner keeps such a shot's
  speed, gives it as much spin as the wheels can, and re-aims it.

## What it is not

These are simulated results: first-order wheels, momentum leaving the wheels in
one instant, and landings computed from the simulator's exit speeds, not watched
balls. No feeder has been built yet. The details and the full table are in the
firmware README, "Re-planning a drill from its own shots", in
`ventures/open-tennis-robots`.
