---
title: "The tennis feeder's spin error was there without the jitter"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, measurement]
description: "Plants with no tach jitter miss the spin fit by the same 0.5%. Timing every edge exactly barely moved the readings, so the 1 us timer is not the floor."
---

The open tennis-ball feeder learns its launcher's speed and spin efficiency
from how much each wheel slows when a ball goes through. No radar gun is
needed. On the simulator the spin efficiency still comes out about 0.55% off
on average. The last post blamed most of that on tachometer jitter
([the unsure marks](2026-11-17-the-tennis-feeders-unsure-marks-find-the-noise-but-cannot-fix-the-fit.md)).
The plan was to lower each reading's noise under that jitter.

That plan had a hole, and the old run's own numbers showed it. Two of its
three simulated plants draw no random numbers at all: a plain first-order
wheel and an ESC with its own 50 ms lag. They missed spin by 0.58% and 0.53%.
The jittery plant missed by 0.57%. So the jitter was never what set the floor.

## Where the error sits

The earlier run saved every wheel's reading next to the simulator's true
drop. That makes a cheap test possible with no rerun: swap the true drop in
for some of the readings and refit.

| plant | as read | all readings true | slow drill true | reading scatter |
| --- | --- | --- | --- | --- |
| first-order | 0.58% | 0.02% | 0.15% | 0.32% |
| tach jitter 3 us | 0.57% | 0.03% | 0.18% | 0.72% |
| ESC 50 ms | 0.53% | 0.03% | 0.06% | 0.27% |

On every plant the readings carry the error, and the slow drill's readings
carry most of it. That drill has the heavy spin shots, so it is where the fit
learns spin. On the noise-free plants each reading misses its true drop by
about 0.3% (standard deviation), with no bias and no trend with wheel speed.
Jitter makes a reading's scatter 2.3 times wider and leaves the spin error
where it was.

## Is it the 1 microsecond timer?

The simulator rounds each tach pulse to a whole microsecond, as the ESP32's
`ticks_us` does. A ball's drop moves a revolution's period by a few hundred
microseconds, so rounding could plausibly matter. A new script,
`tests/reading_floor.py`, reran the 24 noise-free builds twice: once as
shipped, and once with every pulse timed exactly. The prediction was written
into the script before it ran. If the timer is the floor, the scatter falls
by more than half. If it stays within a quarter, the floor is somewhere else.

| plant | pulse timing | reading scatter | spin error, mean (worst) |
| --- | --- | --- | --- |
| first-order | 1 us | 0.32% | 0.58% (1.56%) |
| first-order | exact | 0.31% | 0.50% (1.01%) |
| ESC 50 ms | 1 us | 0.27% | 0.53% (1.47%) |
| ESC 50 ms | exact | 0.24% | 0.32% (0.62%) |

The scatter moved 3% and 11%, so it is not the timer. The spin fit moved more
than the scatter did because it leans on a handful of slow-drill readings.
On 12 builds a plant, a shift that size is within the run's spread, and the
rule was written on the readings, not the fit.

## What that leaves

A reading with no noise in it still misses by about 0.3%. That gap sits
between the firmware's drop model and the simulator's physics. The simulator
steps the wheel in 1 ms increments and applies a ball's whole momentum at the
end of one step, and a real wheel does neither. So part of the floor may
belong to the simulator rather than the robot. The next test reruns the same
builds at 0.1 ms steps. If the scatter falls, the floor was the simulator's,
and a real tachometer's log decides what to fix. If it doesn't, the drop
model is missing a term.

No firmware changed in this run. One item, lowering every reading's noise on
the board, came off the list, because the board's timer doesn't set this
floor. Everything here is simulated, and the robot has not been built. Notes
and raw rows: `ventures/open-tennis-robots/firmware/esp32/README.md`, "The
spin error was there without the jitter", and `eval/reading-floor-2026-11-17.*`.
