---
title: "The tennis feeder's ESC survey gets a 150 ms point, and a confidence check that failed its held-out test"
seo_title: "A 150 ms point for the tennis feeder's ESC-lag survey"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "An untold 150 ms ESC read 169-195 ms on the feeder's survey; a seventh grid lag fixes it. A check meant to flag unreliable picks did not hold out."
---

The open tennis-ball feeder's ESP32 reads each ball's momentum from how much
its launcher wheels slow down. To do that well it has to know how long the
motor controller (the ESC) takes to follow a command. So after every ball the
board refits each wheel at a grid of candidate lags, 0, 20, 50, 100, 200 and
400 ms, and picks the one that fits best, refined by a parabola between
neighbours. [The run before this one](2026-11-18-the-tennis-feeders-esc-lag-survey-was-covering-for-a-coarse-grid.md)
left one build off: an untold 150 ms ESC read
188 ms.

**What was wrong.** This run kept every surveyed wheel's inputs from 72
simulated drills and refitted each wheel at 15 lags. Any candidate grid could
then be scored without another drill. On drills with enough wheels for the Pi
to give advice, the shipped grid read a 150 ms ESC as 152-195 ms, 13-30% high
on 5 of 6. With a point at 150 ms it read 148-155 on all six. A parabola on a
linear axis instead of the log one was far worse, reading a 50 ms ESC as
63-67. So the gap in the grid was the cause, and the log axis was right.

**What could not be fixed.** On slow wheels a long ESC fits almost equally
well anywhere from 100 to 400 ms. The ESC and the wheel are two lags in
series, and when the ESC's lag is a third of the wheel's or more, a drill's
balls barely tell them apart. A finer grid does not help there.

**A check that failed.** We designed a flag on the first 72 drills to catch
that case: call the pick unsure when every lag within 15% of the best fit
spans more than a factor of two or reaches the grid's end. On those drills it
flagged only builds of 180 ms or more, and 34 of the other 35 were within
15%. On 24 held-out drills (new ESC lags, wheel lags, seed and launcher) it
kept every build of 130 ms or less sure and right. But three builds at
165-210 ms came out sure and 20-32% wrong. It does not ship.

**What shipped.** The board now surveys seven lags, with 150 ms added, and
the Pi reads seven slots in the survey frame. Update the Pi and the board
together. On the held-out drills the new grid missed nothing the old one hit
(19 of 24 within 15%, against 18). The extra refit costs about 17% more
survey time per ball, so drills now count 16-18 surveyed wheels where they
counted 18-22, just enough for the Pi's 16-wheel rule.

All of this is simulated, with the simulator's one ESC shape. A real ESC's
step response on a scope is still the way to set a long lag. Details and
tables: `ventures/open-tennis-robots/firmware/esp32/README.md`, "The ESC-lag
survey between 100 and 200 ms", and `eval/esc-grid-gap-2026-11-18.txt`.
