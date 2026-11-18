---
title: "The tennis feeder's speed-mode ESC needed a ramp and a step train"
seo_title: "Tennis feeder: reading a ball's drop on a speed-mode ESC"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, control]
description: "A drop fit for a speed-mode ESC that models the current-limited ramp: in simulation, drops over 2% off fell from 592 of 768 to 88, loop read from a step train."
---

Earlier today the open tennis-ball feeder's
[firmware notes](../../ventures/open-tennis-robots/firmware/esp32/README.md)
ended on a failure. A builder can run the launcher's ESC in a speed mode, where
it holds an rpm setpoint with a PI loop of its own. The feeder calibrates its
launch model from how much each ball slows the wheels, and no fit could read
that drop. A linear fit of the ESC's PI loop read up to 95% off on the
simulator. The cause was the motor's current limit. A ball takes 6-10% of the
wheel's speed, so a fast loop asks for more acceleration than the motor has,
and the wheel climbs back on a straight ramp before the loop's curve takes over.
This run built the fit that models the ramp.

## A ramp, then the loop's tail

After the ball, the wheel accelerates at the limit less its own drag. Then,
once the speed error has fallen far enough that the loop's proportional term no
longer asks for more than the limit, the ordinary PI response takes over. Both
pieces have closed-form averages over a revolution, which is all a one-magnet
tach measures, so the fit stays cheap: a one-dimensional search for the drop at
each candidate ball time. Two details only showed up on the simulator. The
board's own slow trim keeps nudging the setpoint while the ESC is clamped, and
the clamped wheel ignores those nudges. Carrying them through the clamp took a
build's 10% drops from 1.8-2.3% off to 0.1-0.3%.

## Three readings a ball cannot give

The ramp needs the current limit and the wheel's drag. Both come from a spin-up
from rest at the limit, where the speed follows a known exponential. On 3 s
spin-ups the fit read them within 0.03%.

The fit also needs the ESC's loop, and this is where the first plan failed. The
feeder already picks an ESC's lag from a drill's own balls, so the same survey
picked the loop: the frequency and damping that leave the least residual over
24 balls. The balls barely fix it, though. A 5 Hz loop picked at 5.07 Hz read
drops up to 4.3% off, against 0.65% at 4.97 Hz. So the loop comes from a
different test: the board raises its command 2% and lowers it again, four times,
on a free-spinning wheel at 1,500 rpm. Picked that way, every simulated loop
came within 1.5% in frequency and 0.05 in damping, with or without 5 us of tach
jitter.

## Measured, on the simulator

The same 16 assumed ESC builds and 24-ball drills as the failed fit: 2 to 20 Hz
loops, two dampings, light and heavy wheels, exact and jittery tachs.

| fit | drops more than 2% off | of those not marked unsure | worst unmarked |
| --- | --- | --- | --- |
| linear PI loop, picked from the balls | 592 of 768 | 21 | 6.2% |
| ramp then tail, loop from the balls | 225 | 85 | 6.24% |
| ramp then tail, loop from the step train | 88 | 11 | 3.84% |

A new unsure mark helps too. A 20 Hz loop on a light wheel at 1,500 rpm is back
on its setpoint before the ball's own revolution ends. The revolutions after it
then barely show the ball, and those drops read 18-56% off with almost no
residual. The fit now measures how much of the drop the revolutions can see and
marks the ball when it is too little. On 12 held-out builds, none of which any
choice was made on, 65 drops were more than 2% off and 60 of them were marked.
The worst unmarked drop was 2.17% off.

## What isn't known

This is still one made-up ESC: a textbook PI loop, a hard current clamp and an
integrator that freezes while clamped. A real VESC has its own filters and
anti-windup. So nothing here is on the board yet. The fit lives in the
repository's `tests/` folder until a bench log of a real VESC in speed mode
shows a ramp and a tail: a spin-up, the step train and a few balls, with the
ESC's own rpm beside the hall tach. That one log would also give the fit its
three readings.
