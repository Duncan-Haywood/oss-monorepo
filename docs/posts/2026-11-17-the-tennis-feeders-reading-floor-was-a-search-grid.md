---
title: "The tennis feeder's reading floor was a search grid, not the physics"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, measurement]
description: "A ten-times-finer simulator left the 0.3% drop-reading scatter unchanged. The fit's grid for the ball's moment was the floor; one extra solve halves it."
---

The open tennis-ball feeder learns its launcher's speed and spin efficiency
from how much each wheel slows when a ball goes through. Even on a simulated
wheel with no sensor noise, each drop reading missed the simulator's true drop
by about 0.3% (standard deviation), and that was enough to put the spin
efficiency 0.5 to 0.6% off. The [last post](2026-11-17-the-tennis-feeders-spin-error-was-there-without-the-jitter.md)
ruled out the board's 1 microsecond timer and left two suspects: the
simulator's 1 ms steps, or a term missing from the drop model.

## Neither suspect

Running the simulator's wheel at 0.1 ms steps changed nothing. The readings
scattered 0.31% instead of 0.32%, and 0.27% on the plant with a lagging ESC,
the same in every speed band. (A build took only 7% longer, not ten times:
the firmware's own work, not the physics, is most of the run.)

A missing term was hard to believe on the simpler plant, because there the
firmware's model is the simulator's own physics: a first-order lag on the
commands the board logged, a step drop when the ball goes through, and each
revolution's period as its mean speed. If the model is exact and the inputs
are noise-free, the only thing left is how the fit searches that model.

## The grid

The fit does not know when the ball arrived inside a revolution. It tries
nine moments across two revolutions, then nine around the best one, then nine
more. Each level spans a quarter of the last, so the third level's step is
1/64 of a revolution: about 0.19 ms at 5,000 rpm.

A new script keeps each fit's inputs from the same 12 builds (755 wheels) and
refits them offline with finer searches. Before running it, the prediction
was written into the script: a scatter under 0.15% means the search is the
floor. It was:

| search | first-order plant | ESC-lag plant | steps per wheel |
| --- | --- | --- | --- |
| as shipped (3 levels) | 0.32% | 0.27% | 36 |
| finer lag search only | 0.31% | 0.27% | up to 66 |
| 4 levels | 0.12% | 0.13% | 48 |
| 3 levels + one parabola solve | 0.15% | 0.15% | 36 |

## The fix that costs nothing

The board runs the fit one grid level per 10 ms control update, so another
level would delay each result by about 0.12 s per wheel. The shipped change
adds no level. After the last grid it fits a parabola through the best point
and its two neighbours, solves once at the parabola's vertex, and keeps that
answer if it fits better. That is one extra solve next to the step's nine.

Rerunning the drills end to end with it:

- reading scatter: 0.32% to 0.16% (first-order), 0.27% to 0.15% (ESC lag)
- spin efficiency error: 0.58% to 0.31% (worst 1.56% to 0.58%), and 0.53% to
  0.34% (worst 1.47% to 0.72%)
- speed efficiency error: unchanged at 0.07% and 0.02%

## What this does not show

All of this is simulated, on one seed and two plants. The plant with a
jittery tachometer was not rerun; its scatter comes from the jitter. A real
ball also takes a few milliseconds to pass through the wheels, not an
instant, and neither the model nor the simulator includes that. The next
honest check is a real wheel's tach log around a ball.

Code and numbers: `ventures/open-tennis-robots/tests/fit_grid_floor.py`,
`tests/reading_floor.py`, and the README section "Not the simulator's step
either" in `firmware/esp32/README.md`.
