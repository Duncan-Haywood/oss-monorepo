---
title: "The tennis feeder's board now surveys how long a ball touches its wheels, with a margin it had to earn"
seo_title: "Surveying a ball's contact time on the feeder's own board"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "The feeder's ESP32 now refits each calibration ball at seven contact times. It names spread contacts within 1 ms, but instant ones fooled it, so the advice has a margin."
---

The open tennis-ball feeder reads each ball's momentum from how much its two
launcher wheels slow down. Earlier today (the firmware README's "A take that
lasts a few milliseconds", after
[the run on the spin error](2026-11-17-the-tennis-feeders-spin-error-was-there-without-the-jitter.md)),
a run found
that a ball which stays in the wheels for 6 ms, instead of leaving in an
instant, makes that reading scatter about 1% around the truth. The board's fit
got a contact-time term that brings the scatter back to about 0.2%, but only
when the fit knows the contact time. Nobody knows a real ball's contact time, so
the term shipped switched off.

This run let the board work it out from its own balls.

## What the board does now

On a calibration drill, the Raspberry Pi sends a new command, SURVEY_TAKE. After
each ball, the ESP32 refits each wheel's speed record seven times, assuming a
contact of 0, 2, 3, 4, 5, 6 and 8 ms. It adds up how badly each fit misses and
sends the totals back. The Pi then prints one line, either "keep TAKE_US = 0"
or "set TAKE_US = 6000 in config.py and re-flash". The same pattern already
picks the ESC's lag.

Two things went wrong on the first try, and both changed the design:

- **The cheap fit could not see the difference.** The ESC-lag survey skips the
  fit's last refinement step to save board time. Without that step every
  candidate missed by about 60 times as much as the full fit (775 against 13
  parts per million on the first ball), and a 6 ms build was told it had an
  instant contact. The take survey runs the full fit, about 5 s of the board's
  spare control ticks per ball.
- **The next ball cut the survey short.** The calibration drill feeds a ball
  every 4 s, so 11 of 12 surveys were interrupted. During a calibration drill
  the Pi now waits for each ball's survey before feeding the next, capped at
  8 s. On the simulator that added 42 s to a 12-ball drill, and no survey was
  cut.

## What the simulator said

The test used 24 simulated builds: two wheel models, three launchers, and four
kinds of contact (instant, a smooth 3 ms and 6 ms rise and fall, and a 4 ms
contact that pushes hardest at first touch). The prediction was written before
the run.

| contact | contact times picked (6 builds) | drop scatter, as a step | told the pick |
| --- | --- | --- | --- |
| instant | 0, 0, 1.5, 2.5, 2.5, 2.5 ms | 0.14% | 0.33% |
| smooth 3 ms | 3, 3, 3, 3.5, 3.5, 4 ms | 0.27% | 0.17% |
| smooth 6 ms | 5, 6, 6, 6, 6.5, 6.5 ms | 0.68% | 0.24% |
| front-loaded 4 ms | 0, 4.5, 4.5, 4.5, 5, 5.5 ms | 0.50% | 0.26% |

The smooth contacts were named within 1 ms every time. When the board was told
the pick, the scatter on spread contacts fell to between a third and two thirds
of what it was. That part of the prediction held.

The instant contacts broke it. On one of the two wheel models, all three
builds picked 2.5 ms, and the readings got worse when the board was told that.
The extra term was soaking up some other mismatch between the fit and the
simulated wheel, not a contact time. One 6 ms build picked 5 ms and its spin
estimate got worse too. The decision rule written before the run said this
meant the advice needed a margin.

## The margin, and how far to trust it

The advice now says "set TAKE_US" only when the best contact time's fit misses
by at most 0.6 of the instant fit's miss. The instant builds that fooled the
survey came in at 0.66 to 0.76. No threshold can separate them cleanly, because
some genuine 3 ms builds came in at up to 0.83. On these builds the margin
advises none of the instant builds, 2 of the 3 ms ones, 4 of the 6 ms ones and
5 of the front-loaded ones. The 6 ms build that got worse is not advised.

The 0.6 was chosen after looking at these 24 builds, so it was checked on 24
more builds with a different random seed:

HELDOUT

## What is still unknown

All of this is simulated, and the shape of a ball's contact is an assumption.
The survey's 5 s per ball has not been timed on a real ESP32. A real wheel's tach
log around one ball would measure the contact time directly, and it would beat
any survey. The firmware, the simulator and every table are in the
[open-tennis-robots venture](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots),
MIT licensed.
