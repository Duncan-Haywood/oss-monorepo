---
title: "A longer look helps the tennis feeder's drop reading, but only when its tach is noisy"
seo_title: "Tennis feeder: a longer fit window averages out tach jitter"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Reading 24 revolutions after each ball instead of 8 cut the feeder's drop error on a jittery tach by a quarter, and did nothing on clean wheels."
---

The open tennis-ball feeder's ESP32 measures each ball by how much its
launcher wheels slow down when it passes through. That "drop" is the number
the feeder's launch model is fitted from, so how accurately it is read sets
how accurately the machine aims.
[The previous run](2026-11-18-the-tennis-feeders-long-esc-lags-needed-a-longer-look.md)
found that the board's ESC-lag survey was reading too little of each wheel's
recovery, 8 revolutions after the ball, and moved it to 16. It left one
question open: does the drop reading itself, which uses the same 8-revolution
window, also do better with a longer one on slow wheels?

**Why it might not.** The survey's trouble was telling two lags in series
apart, and a short window can't. The drop fit is told the ESC's lag, so it
doesn't have that problem. A longer window gives it more data for the same
unknowns, but also more of whatever its model of the wheel gets wrong.

**The test.** A new script ran 8 simulated builds (four plants, two wheel
lags) through a calibration drill and a slow-shot drill, kept every drop
fit's raw inputs alongside the simulator's true drop, and refitted each one
offline reading 8, 12, 16 and 24 revolutions after the ball.

**What the design builds showed.** On wheels with a clean tachometer, 8
revolutions were already as good as any longer window: errors of 0.11-0.20%
either way. On wheels whose tach edges carry 3 µs of timing jitter, the
longer windows helped steadily. At 24 the typical error fell from 0.80% to
0.61%, and the worst wheel's from 2.64% to 1.48%. So slow wheels were not the
drop fit's problem. A noisy tach was, and a longer window averages it out.

**Held out.** The prediction and the rule for shipping 24 were committed to
the repository before a second set ran, with new wheel lags, a new seed, a
different launcher and two plants the design never saw (a 100 ms ESC, and a
120 ms ESC with a jittery tach). It held on every clause. On the jittery
builds the error fell from 0.62% to 0.47%, a quarter lower, and every one of
them improved. The worst wheel went from 2.49% to 1.79%. No clean build got
worse by more than 0.01 points.

**What changed.** The board's drop fit now reads 24 revolutions after the
ball (`LOOP_FIT_AFTER`). Each fit does about 2.2 times the arithmetic. The
board already spreads that work over its control ticks, but nobody has timed
it on a real ESP32 yet.

**What isn't known.** It's all simulated, with Gaussian edge jitter. A real
Hall sensor's jitter could be larger, which would make the gain bigger. It
could also be tied to the magnet's position on the wheel, and averaging over
more revolutions wouldn't remove that. The tables and the script are in the
venture's firmware README, "The record's drop fit and its window".
