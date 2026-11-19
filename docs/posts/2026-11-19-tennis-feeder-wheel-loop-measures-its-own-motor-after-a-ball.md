---
title: "The tennis feeder's wheel loop now reads its own motor's strength before each ball"
seo_title: "Tennis feeder: the wheel loop reads its motor's strength"
date: 2026-11-19
tags: [open-tennis-robots, firmware, control, simulation]
description: "A ball-hold fix left fast wheels dipping after each ball. The integrator already knew why. Using it halved the dips on a held-out grid."
---

The open tennis-ball feeder throws balls with two spinning wheels. Each ball
takes a bite out of the wheels' speed, and the ESP32's speed loop has to
bring them back before the next ball can go. Two days ago a change called
the "ball hold" stopped the loop's integrator from treating that bite as a
lasting offset. It made recovery faster almost everywhere, with one
exception the write-up named: on light, quick wheels (0.2 s to spin up)
whose motor is stronger than the firmware was told, the wheel now dipped
more than 2% below its target after recovering on 17 of 72 simulated
cases, up from 7.

## Why the fast wheels dipped

The loop's command is a feedforward guess (target speed divided by the
motor's free speed, `WHEEL_RPM_FULL`), plus a proportional term on the
error, plus an integrator. If the real motor spins at 11,000 rpm at full
throttle and the firmware was told 9,000, every unit of command does 1.22
times what the loop expects. The proportional term overshoots, and the
integrator, now held still during a ball, can no longer cushion it.

The old advice was to measure the free speed on the bench. The board
already has that measurement, though. Before the ball, the integrator has
settled to whatever offset makes the wheel hold its speed, and on a strong
motor it sits at about -18% of the feedforward. That number is the motor's
strength: true over told equals feedforward over (feedforward plus
integrator).

## The change

While the ball hold is armed, and only when the integrator says the motor
is stronger than told, the loop scales its proportional gain by that ratio,
with a floor of 0.6. A weaker motor keeps its gain, and nothing outside the
second or two of a ball's recovery changes. No value was tuned. The floor
cannot bind under the existing integrator bound.

## The test, written first

The predictions and a nine-clause rule were committed before either sweep
ran. The rule required fewer dips on the grid where the problem was seen,
at least 25% fewer on a held-out grid of wheel lags and motor speeds no run
had used, and no loss on recovery time, gate accuracy or overshoot. Wheels
slower than told had to come out byte-identical.

| | before | after |
| --- | --- | --- |
| 0.2 s wheels dipping over 2% (original grid) | 17 of 72 | 8 of 72 |
| faster-than-told wheels dipping over 2% (held-out grid) | 122 of 324 | 73 of 324 |
| mean time until the next ball may go (held out) | 0.82 s | 0.77 s |
| balls that would leave over 3% off speed (held out) | 4 of 432 | 1 of 432 |
| worst overshoot (held out) | 6.3% | 4.9% |

The prediction was "about 9 of 72"; the result was 8. Every clause held, so
`LOOP_BALL_KP_LEARN` now ships on. The gain grows with the mismatch, which
is what the mechanism predicts. At 10,000 rpm the dips went from 28 to 19
of 108, and at 12,000 rpm from 58 to 30.

## What it doesn't show

All of this is the project's simulator, a first-order wheel behind a
first-order ESC. A real ESC's throttle curve is not a straight line, so the
integrator's offset is a gain estimate at the speed it was learned at. The
change uses it only there, for one ball's recovery. The very quickest
wheels (0.15 s) behind a slow 80 ms ESC still dip, and that part is the
ESC's lag. Whole drills on a build with a mis-told motor are the next
check.

Details, raw rows and the pre-registered rule are in
`ventures/open-tennis-robots/eval/ball-kp-learn-2026-11-19.md` and the
firmware README's section "The ball hold on a wheel faster than told".
