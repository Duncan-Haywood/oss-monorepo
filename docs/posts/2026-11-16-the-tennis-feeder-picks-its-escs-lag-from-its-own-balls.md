---
title: "Our tennis feeder misread spin by 20% behind a lagging ESC, until each build's own balls picked the lag"
seo_title: "Picking an ESC's lag from a ball machine's own shots"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "A second lag in the ESC left our feeder's spin reading 20-24% off. Picking that lag from a drill's own balls brings it to 3-6.5%; guessing it is worse."
---

The open tennis-ball feeder works out its own launcher with no radar gun. Each
ball slows the two wheels a little, and the firmware fits each wheel's drop
using the commands its speed loop sent, treating the wheel as a single lag of
those commands. Earlier today
[another run found](2026-11-16-tennis-feeder-tach-jitter.md) the plants that
break that assumption. Tach jitter is the worst, and the board now flags it
well. An ESC with a lag of its own is the awkward one. It left the
calibration drill's spin reading 20-24% off at worst, and some of those
drills flagged nothing at all.

**Two lags look like one.** If the ESC ramps its output, there are two lags
between the command and the wheel. A single-lag fit absorbs the extra one
into the wheel's lag and the moment the ball arrived. The fit still looks
good, but the drop reads 1-5% low, and the spin estimate is built on the
difference between the two wheels' drops, so it suffers most.

**Give the model the second lag.** The fix is simple once you have the lag:
run the logged commands through it before fitting. With the true lag, the
drill's worst spin error falls from 23.8% to 1.4% (30 ms ESC) and from 19.9%
to 1.8% (80 ms).

**But you have to know it, and guessing is dangerous.** Telling a build with
no ESC lag that it has 20 or 50 ms made the spin reading 41-44% off, roughly
twice as bad as the problem being fixed. The one comfort is that the board's
existing "unsure" flags fire in that case: about a third to half the wheels
were marked.

**Let the balls decide.** A single ball can't separate the two lags
reliably. Picking per ball fixed the bias but blurred the first-order builds.
The lag belongs to the build, so the new tool sums each wheel's leftover
error across a drill for six candidate lags and takes the smallest. On the
simulator it chose 0 for every first-order build, so nothing changed there.
It chose 20 ms for a 30 ms ESC and 100 ms for an 80 ms one. Through the whole
drill that gives a worst spin error of 6.5% and 3.0%, against 23.8% and 19.9%
before. The coarse grid is now the limit (20 ms against the true 30 ms), so
a finer search near the winner is next.

**What's missing.** On a real feeder, the pick needs each ball's raw timing,
and the board doesn't send that to the Pi yet, so the new `ESC_TAU_US`
setting is manual for now. It is all simulation: nobody has logged a real
ESC's step response to see which shape it has. The code, the tables and the
sweeps are in the
[repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/open-tennis-robots/firmware/esp32),
under "An ESC lag picked from the build's own balls".
