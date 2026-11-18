---
title: "One tennis-feeder wheel read 48% high because the Pi spoke too soon"
seo_title: "A ball machine's wheel-drop fit and the three-revolution snapshot"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "A 1,107 rpm launcher wheel read 1.48x its true drop. The board's snapshot ended three revolutions after the ball. Holding the next speeds fixed it."
---

# One tennis-feeder wheel read 48% high because the Pi spoke too soon

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open,
MIT-licensed tennis ball machine. Its feeder calibrates its own launcher
without a radar gun. Each ball takes momentum from the two launcher wheels, and
the board fits how much each wheel slowed. Those drops tell the Pi how
efficiently the wheels turn speed and spin into the ball.

This morning's run on the simulator left one wheel unexplained. A bottom wheel
turning at 1,107 rpm reported a drop 1.48 times the true one. One bad wheel out
of hundreds is enough to drag the drill's spin estimate around, so it needed a
cause.

## Three revolutions

Rerun alone, the wheel misbehaved again: true drop 0.170, reported 0.2515. The
board had recorded 14 revolutions before the ball and only three after it.

The firmware freezes its record of the wheel's revolutions as soon as the wheel
targets change. Anything after that is the next shot's speed change, not the
ball. The Pi sends the next shot's speeds the moment it sees the release,
unless one of the wheels is slow. Until today "slow" meant under 1,000 rpm.
This wheel was at 1,107, so the Pi did not wait, and the record stopped about
0.16 s after the ball.

The fit models the wheel's recovery as a first-order lag driven by the speed
loop's own commands. Three revolutions are not enough for that. It put the
wheel's time constant at the bottom of its search grid, 0.1 s against a true
0.4 s, and over-read the drop by 48%. Another wheel at the same speed, with six
revolutions to work with, read 0.167.

## The fix, and the catch

The Pi now holds the next shot's speeds for the verdict whenever a wheel is
under 3,000 rpm, the speed at which a wheel turns the fit's eight revolutions
in that 0.16 s. On the simulator, with the board told its speed controller's
lag, the 1,000 to 1,500 rpm wheels went from a worst reading of 1.526 to
1.006, and the launcher's spin error from 0.26% to 0.14% on average.

The catch: if the board is *not* told that lag, holding made the launcher fit
worse, 1.46% to 2.10% mean spin error. Longer recoveries carry more of the bias
the untold lag causes. The board already measures that lag itself (a survey
over every ball), so the order of operations is now part of the
[firmware notes](../../ventures/open-tennis-robots/firmware/esp32/README.md):
set the lag from the survey, then run a calibration drill.

## An idea that did not ship

The same run tried a second idea from the queue. The tachometer averages four
revolutions, so a slow wheel's reading is a third of a second old. Averaging a
fixed 40 ms instead cut balls fed more than 3% off speed from 14 to 7 of 336
simulated cases, and the worst from 7.0% to 3.3%. But it pushed the drop fits
3-5% low behind a laggy speed controller. The drop fits are what calibrate the
machine, so the option is in the firmware, measured and off.

Everything here is simulated: a first-order wheel and a first-order speed
controller. A real wheel's tachometer log is still the measurement this work
is waiting for.
