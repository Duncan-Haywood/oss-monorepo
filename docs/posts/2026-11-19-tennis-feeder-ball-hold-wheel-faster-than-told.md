---
title: "The tennis feeder's wheels recover from a ball better when the loop trusts what it learned, but only one way"
seo_title: "Tennis feeder: softer gains for a wheel faster than told"
date: 2026-11-19
tags: [open-tennis-robots, firmware, control, simulation]
description: "Scaling the wheel loop's gains by the learned plant gain failed a held-out set; capped to soften only, it cut ball undershoots 18 to 13 on a fresh set."
---

The open tennis-ball feeder's ESP32 holds each launcher wheel at its target
speed with feedforward plus a PI loop. The feedforward assumes the wheel's
free speed is `WHEEL_RPM_FULL`, a number the builder is meant to measure
once. Two days ago the loop learned to hold its integrator still while a ball
takes momentum from the wheel, which made every drill faster. It had one
cost: on light, fast-responding wheels whose real free speed is 11,000 rpm
while the board is told 9,000, balls left the wheel dipping more than 2%
under target after recovery in 17 of 72 simulated cases, against 7 before.

The reason is plain control: the wheel is 1.22 times stiffer than the loop
thinks, so its proportional term overshoots. But the integrator already knows
by how much. At a steady wheel the command is feedforward plus integral, and
their ratio is the told free speed over the true one. So when a stroke
starts, the board now latches that ratio and scales the gains by it until
the ball's recovery ends.

## The first version failed its own test

The rule was written down before any run: on both a development set and a
held-out set, undershoots over 2% must fall, and recovery time, gate error,
overshoot and failures must not get worse. Scaling both ways passed the
development set (19 to 10 undershoots) and failed the held-out set, 13 to 15.
Wheels slower than told were given stiffer gains and undershot more.

## The second version, judged on fresh cases

Capping the ratio at 1, so only a wheel faster than told gets softer gains,
is the obvious repair, and also exactly the kind of fix that looks good
because it was chosen after seeing the data. So it was judged on a third set
of 96 cases fixed after the first outcome and before this run:

| set | undershoot over 2%, before / after | worst undershoot | mean recovery |
| --- | --- | --- | --- |
| development, 216 cases | 19 / 9 | 4.5% / 3.6% | 0.89 / 0.89 s |
| fresh, 96 cases | 18 / 13 | 5.0% / 4.0% | 0.86 / 0.82 s |

Every clause passed on both, so it ships on by default
(`LOOP_BALL_GAIN = "down"` in `firmware/esp32/controller.py`). A builder who
measures `WHEEL_RPM_FULL` sees no change at all, since the ratio is then
about 1; a builder who doesn't gets a feeder that is more forgiving of it.

All of this is the project's simulator, a first-order wheel and ESC, not a
real machine. The rules, the three sets and the raw output are in
[`eval/ball-gain-rule-2026-11-19.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/eval/ball-gain-rule-2026-11-19.md),
and the write-up is in the firmware README, "The ball hold on a wheel faster
than told". The feeder, the ball-collecting rover and their CAD are MIT
licensed: [open-tennis-robots](https://marisstella.app/open-tennis-robots/).
