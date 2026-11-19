---
title: "The tennis feeder's wheel loop fought an ESC that runs its own speed loop"
seo_title: "Tennis feeder: the wheel loop vs a speed-mode ESC"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, control]
description: "On the simulator, the feeder board's speed loop on top of a speed-mode ESC swung 48 of 144 wheels by over 1%. The fix, and a drop fit that failed."
---

The open tennis-ball feeder's ESP32 runs its own speed loop on each launcher
wheel. It reads a hall tachometer, and from that it sets the throttle it sends
to a hobby ESC. Every fit and gain in the
[firmware](../../ventures/open-tennis-robots/firmware/esp32/README.md) so far
assumes a plain throttle ESC, where the wheel follows the throttle with a lag
of 0.2 to 0.8 s. But a builder with VESC-class firmware can set its input to a
speed mode. The throttle then becomes an rpm setpoint, and the ESC holds that
speed with a PI loop of its own. The flagship's to-do list had "an ESC with its
own speed loop" on it. This run put one in the simulator.

## Two loops, one wheel

The simulated ESC gets a PI loop on an exact speed sensor. It has a natural
frequency of 2 to 20 Hz, damping 0.4 or 0.7, and a drive clamped at the
motor's limit. The board's loop runs on top, unchanged. Its proportional term
was tuned for a wheel that takes about half a second to follow the throttle.
Here the wheel follows in tens of milliseconds, and the board only sees it
through a tach that averages four revolutions. The result is a loop gain of
about 1.8 behind a delay, which is how you build an oscillator.

`tests/speed_esc_sweep.py` runs one wheel for 6 s with no ball: 12 ESC loops,
four target speeds (600 to 6,000 rpm) and three ESC speed maps (7,000, 9,000
and 11,000 rpm at full throttle, against the 9,000 the board is told). It then
reads the last second:

| board loop | worst swing (% of target) | worst mean error | wheels swinging over 1% |
| --- | --- | --- | --- |
| the existing PI | 147.7 | 3.22% | 48 of 144 |
| no P, half the integral gain | 0.00 | 0.05% | 0 of 144 |

So `config.ESC_SPEED_LOOP` now exists, off by default. With it on, the board
drops its proportional term and keeps half its integral gain. That leaves a
slow trim for an ESC whose speed map is a few per cent off what
`WHEEL_RPM_FULL` says. Half is the low end of a flat band: 0.3 had not finished
trimming a 22% map error after 5 s, and the full gain started to ring on one
slow, lightly damped ESC. That share was picked on the same cases it is
measured on.

## The ball reading notices, then gives up

The feeder calibrates its launch model from how much each ball slows the
wheels. It fits each drop as a step in a wheel that lags its commands. With a
speed-mode ESC that model is wrong. On the simulator the fit marked every bad
reading unsure: 75 of 75 drops more than 2% off. So the Pi's existing warning
fires and the launcher is not calibrated silently wrong. It is not calibrated
at all, though, and `config.py` now says to calibrate with the ESC in duty mode.

## A fit for the speed loop, tried

A PI loop answers any step in its error with the same damped curve, whether
the step comes from a setpoint change or a ball. The integral of that curve has
a closed form, e^(-σt)·sin(ω_d t)/ω_d. So a revolution's mean speed is linear in
the ball's drop, which makes the fit cheap enough for the board. Told the true
loop, it reads wheels built from its own model to 0.01%. It reads the
simulator's wheels within 0.3% as long as the ESC's drive stays under its
limit.

Two things broke it. The first: one ball cannot tell a big drop that recovers
fast from a small one that recovers slowly. Searching the loop wheel by wheel
read up to 40% off. The loop belongs to the build, not the ball, so a survey
picked it from the sum over a whole 24-ball drill instead. The second was the
current limit, and the survey could not fix that.
On 16 simulated builds, only a slow 2 Hz loop on a light wheel read within 4%;
at 5 Hz and faster the worst drop was 16 to 95% off. Over 768 balls, 592 read more than 2% off, and the
unsure mark caught 571 of them. A 10% drop at 6,000 rpm asks a 10 Hz loop for about 53,000
rpm/s, and a launcher motor gives 11,000 to 45,000. While the drive is clamped,
the wheel recovers on a straight ramp that the PI curve doesn't have. So the
fit stays in `tests/` and the board keeps only the loop fix.

## What isn't known

All of this is one made-up ESC: a textbook PI loop on a perfect sensor. A real
VESC's speed loop has its own filters, ramps and anti-windup, and none of the
gains here are measured. The next useful thing needs hardware: log a real VESC
in speed mode through a ball, with its own rpm and current over UART beside the
hall tach. That would show whether the recovery really is a clamped ramp
followed by a PI tail. The full numbers are in the firmware README, section "An
ESC with its own speed loop".
