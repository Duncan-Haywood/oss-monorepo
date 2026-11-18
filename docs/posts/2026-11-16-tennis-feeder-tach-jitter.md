---
title: "Five microseconds of sensor jitter would triple our tennis feeder's spin error"
seo_title: "Hall sensor jitter and a ball machine's spin calibration"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "Our feeder reads spin from wheel-speed drops. Simulated, 5 us of tach jitter takes it from 1.6% to 5.3% off, so the board now flags fits it cannot vouch for."
---

# Five microseconds of sensor jitter would triple our tennis feeder's spin error

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open,
MIT-licensed tennis ball machine. Its feeder calibrates its own launcher
without a radar gun. Each ball takes momentum from the two launcher wheels, so
each wheel's speed drop works as a small momentum meter. Earlier today the
firmware learned to fit that drop
[from the speed loop's own commands](2026-11-16-why-the-tennis-feeders-spin-reading-was-off.md).
On the simulator that brought the calibration drill's worst spin error down to
1.6%.

That 1.6% has a catch. The simulator's wheel is a first-order lag of its ESC
command, and that is exactly the model the firmware fits. So 1.6% is the best
the method can do, not a measurement. This run asked what happens when a real
wheel breaks the model, and whether the firmware can notice.

## Breaking the wheel on purpose

We ran one wheel at a time on the firmware's own tach and speed loop, with
plants that each break the model in one way a real build might. We used 24
cases per plant: 1,500 to 6,000 rpm, 6% and 10% drops, wheel lags of 0.2 to
0.8 s.

| plant | fit error, mean / worst |
| --- | --- |
| the model itself | 0.21% / 0.72% |
| motor current limit (down to 3,000 rpm/s) | at most 1.2% |
| throttle curve (speed ∝ command^1.25) | 0.25% / 0.89% |
| tach jitter, 5 µs | 0.74% / 2.27% |
| tach jitter, 20 µs | 6.7% / 48% |
| ESC with its own 30 ms lag | 2.8% / 8.5% |
| ESC with its own 80 ms lag | 3.3% / 16.3% |

Two failure modes matter, and two that sounded worrying don't. The ball's
drops are too small to reach a current limit. A throttle curve gets absorbed
by a free constant in the fit. What hurts is the timing of the tach's edges,
and an ESC that runs a speed loop of its own between our command and the
motor.

Through a whole calibration drill, on 18 simulated builds, the numbers get
worse. The spin is read from the difference between two wheels' drops, so
small per-wheel errors add up:

| plant | spin efficiency error, worst / mean |
| --- | --- |
| the model itself | 1.6% / 0.4% |
| tach jitter 5 µs | 5.3% / 2.0% |
| tach jitter 10 µs | 16.0% / 5.4% |
| tach jitter 20 µs | 22.1% / 8.4% |
| ESC lag 30 ms | 23.8% / 5.5% |
| ESC lag 80 ms | 19.9% / 6.6% |

## The fit now says when it can't vouch for a drop

The fit is linear least squares at a given time constant and ball time. Its
normal equations therefore give a standard error for the drop, and the
residual gives the noise to scale it by. When that standard error is over 1%
of the drop, the board sets a new "unsure" bit for that wheel in the record it
sends the Pi.

On single wheels, 67 of the 72 drops that were more than 2% off got the bit,
and 14 of the 152 good ones did. Across whole drills, the true-model plant
never had a single wheel marked (0 of 432). Every broken plant had 30% to 96%
of its wheels marked. Jitter got caught in every drill. ESC lag didn't:
some drills on those plants marked no wheels at all and still read the spin
badly, so the warning fired in only 9 and 12 of 18 drills. A second lag is a
smooth shape, and a longer time constant can partly absorb it, so the
residual stays small.

## Throwing the unsure drops away made things worse

The obvious move is to leave the marked drops out of the launcher fit. We
tried that first. With 5 µs of jitter it raised the worst spin error from
5.3% to 7.2%. With 10 µs it went to 89%, because almost nothing was left to
fit. It helped on just one plant (the 80 ms ESC lag, 19.9% to 12.2%). A noisy drop is still an unbiased one, so throwing it away only loses
data. The marks work as a detector, not as a filter. So the Pi now fits with
every drop and warns when a tenth or more of them are marked. The warning
says to check the tach (sensor gap, magnet, interrupt) and whether the ESC is
in a closed-loop speed mode.

## A one-word fix to the firmware

This also turned up something in the board code. The tach handler was a
*soft* interrupt in MicroPython, so the edge's timestamp was taken whenever
the main loop next got round to it, which could be most of a control tick
late. Given the table above, that's the worst place for timing error to come
from. It is now a hard interrupt (`hard=True`). The handler already allocated
nothing, which a hard interrupt requires. The simulator calls the handler at
the true edge time either way, so it can't show the gain. Timing a real
wheel's edges against a scope is the measurement that would.

## What's next

Two things look worth doing, plus that one measurement. The jitter sits on
each edge *time*, so neighbouring periods share it with opposite signs, and a
fit on the edge times should do better than one on periods. ESCs that run
their own speed loop need a second lag in the model. All the numbers here come
from a simulator with assumed plants. The sweeps that produced them are
`tests/loop_residual_sweep.py` and `tests/plant_drill_sweep.py` in the
repository, and the full write-up is in the firmware README, under "When the
wheel is not a first-order lag".
