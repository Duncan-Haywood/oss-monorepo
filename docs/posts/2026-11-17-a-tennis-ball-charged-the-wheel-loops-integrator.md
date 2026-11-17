---
title: "Why the tennis feeder's slow wheel sat 3.6% low after each ball: its integrator was learning the wrong things"
seo_title: "A launcher wheel's integrator learned the ball and the brake"
date: 2026-11-17
tags: [open-tennis-robots, firmware, control, simulation]
description: "After each ball the feeder's slow wheel overshot 19%, then sat 3.6% low for 2 s. The integrator was learning the ball and the brake. Fixing both cut the wait."
---

The open tennis-ball feeder fires each ball between two spinning wheels. The
firmware will not feed the next ball until both wheels have been back within
3% of their target speeds for six revolutions. An earlier run left a question
open: after a ball, a slow wheel (526 rpm, on a wheel that takes 0.8 s to
respond) settled 3-4% *low* and crept back at about 10 rpm a second. That
cost about 2 s a shot.

Logging the speed loop's integrator on the simulator showed two separate
causes. In both, the integrator was learning something that is not an offset.

**The ball.** The ball took the wheel from 526 rpm to about 300. The
tachometer averages four revolutions, so at that speed it shows a change
about 0.3 s late. For the whole climb back the loop saw a large error and
integrated it. The integrator reached +0.022 of full throttle, about 200 rpm
worth of command on top of the feedforward. The wheel went through its
target and on to 625 rpm, 19% high. Then the integrator had to discharge.
It went past zero to -0.004, and that held the wheel 3.6% under target.

**The brake.** Before that shot the wheel had been slowed from 3,895 to 526
rpm. The firmware lowers the target along a power-limited ramp, and at low
speed that ramp falls faster than a heavy wheel can slow down. The loop
integrated the gap until the integrator stood at -0.164 of full throttle,
nearly three times the whole 526 rpm feedforward. The command sat at zero.
The wheel coasted down to about 90 rpm, then came back through its target to
620.

**Three changes, all in the wheel's speed loop:**

- *Ball hold.* The board starts every stroke itself, so it knows when a ball
  is coming. From the stroke's start until the wheel has dropped and climbed
  back to its target, the integrator sees its error clamped to ±0.5% of the
  target. Feedforward and the proportional term do the recovery.
- *Ramp hold.* While the ramp is still lowering a target, the integrator
  holds. Only on the way down: holding it on the way up delayed a wheel that
  is slower than the board thinks.
- *A bound.* The integrator stays within 35% of the feedforward. Its real job
  is the gap between the wheel and the configured free speed. A wheel 22%
  slower than told needs 29%.

**Clamping all the time was the wrong fix.** The first try clamped the
integrator's error everywhere. That fixed the ball recovery just as well, but
it starved the integrator of its real job. Over 336 slow-wheel spin-ups,
including wheels 22% off their configured speed, a 1% clamp left 125 cases
never settling, against none before.

**Measured on the simulator.** Each sweep covers four plant models, three
wheel lags and two wrong free speeds.

| | before | now |
| --- | --- | --- |
| one ball: time until the next may go, mean / worst (216 cases) | 1.37 / 4.96 s | 0.89 / 2.43 s |
| one ball on the 6,065 / 526 rpm shot, mean | 3.03 s | 1.79 s |
| one ball: worst overshoot | 17.8% | 6.0% |
| one ball: balls that would leave over 3% off speed | 11 | 1 |
| braking to a slow shot: time to steady, mean / worst (192 cases) | 5.91 / 10.97 s | 4.97 / 7.85 s |
| braking: the slow wheel's lowest speed, worst | 11% of target | 69% |
| slow-wheel spin-ups: worst time to steady (336 cases) | 11.62 s | 7.63 s |

**On whole drills.** A 30-shot drill that keeps alternating fast and slow
wheels now finishes faster on every one of the 12 simulated builds tried:
2.5-3.8 s sooner on wheels that respond in 0.4 s, and 8-15 s sooner (about 5-9%)
on wheels that take 0.8 s. The feeder's own measurement of each ball (the
wheels' speed drop, which it uses to calibrate itself) reads as accurately as
before, and the calibration it produces moves by less than 0.2 points.

**What it costs.** Wheels that are faster than the board is told (11,000 rpm
free speed against 9,000) dip a little more after a ball. On the fastest
wheels 17 of 72 cases dipped more than 2%, against 7 before. The drill's
wheel pairs spinning up from rest take up to 5.29 s instead of 5.12. The
bound could also bite on a real ESC with a dead band at low throttle. If a
slow wheel then never reaches its speed, the drill stops at its ready timeout
and says so, and the bound is a single constant.

**Not known.** All of it is the simulator's first-order wheel. A real ESC
with its own speed loop may treat a ball and a brake differently, and a real
wheel's drop is the first thing to log when a feeder is built. The firmware,
CAD and drills are MIT licensed in `ventures/open-tennis-robots/`. Nothing
has been built yet.
