---
title: "Our ball machine weighs each shot by how much its wheels slow, and the lowest revolution hid up to 38% of it"
seo_title: "Measuring a ball launcher's exit speed from tach pulse times"
date: 2026-11-16
tags: [open-tennis-robots, robotics, firmware, estimation]
description: "A two-wheel launcher's speed drop measures each ball's momentum. Fitting it to the tach's pulse times halved the speed fit's error in simulation."
---

# Our ball machine weighs each shot by how much its wheels slow, and the lowest revolution hid up to 38% of it

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open, MIT-licensed tennis ball machine. It hasn't been built yet: everything below runs the real firmware on a simulated board. Its launcher pinches each ball between two spinning wheels. To land a ball where a drill asks, the planner needs two numbers for the build: how much of the wheels' surface speed the ball leaves with (the speed efficiency), and how much of their speed difference becomes spin.

A radar gun can measure those. So can the wheels. A ball leaving at 25 m/s takes its momentum from the wheels, and each wheel slows by a predictable fraction, about 8.8% on a flat shot with our CAD's wheel inertia. So every shot's drop is a free momentum measurement. Earlier today the firmware started sending each shot's drop to the Pi, which fits the two efficiencies from a drill's worth of them.

## The lowest revolution is only part of the drop

The wheel's tachometer gives one pulse per revolution, so the firmware recorded the slowest single revolution after the ball. That revolution never shows the whole drop. The ball arrives somewhere inside a revolution, and by the time the next revolution ends, the speed loop has started pulling the wheel back up. We compared each recorded drop with the simulator's true one over 336 launched wheels. The lowest revolution showed between 62% and 99.5% of the drop: 93% on average, and 89% for wheels under 2,000 rpm.

The fit tried to correct for this with a formula for the missing share, using one "recovery time" for the speed loop. The formula's shape was wrong. The loop reads a 4-revolution average, so it notices a drop late. The wheel recovers less in its first revolutions than the formula assumed, and more afterwards. The fitted recovery time and the speed efficiency then traded off against each other. With the few wheel speeds of an ordinary drill, the speed efficiency came out 3% to 6% off. On this machine, a 4% speed error moves a 25 m/s groundstroke's landing by about a metre.

## Fitting the pulse times themselves

The fix uses data the firmware already had: the time of every pulse. The tach now keeps its last 128 revolution periods in a ring. Periods are small integers, so the interrupt handler never allocates memory. For each launched ball, the firmware fits a simple model to the periods:

- the wheel turns at its pre-ball speed until an unknown moment inside the first slowed revolution;
- then it drops by D and recovers along a parabola;
- each revolution's average speed is one over its period, so each period integrates that curve over its own span.

For any guessed moment of impact, the model is linear in D and the recovery terms, so it is a 3-by-3 least-squares solve. The firmware tries the moment of impact on three nested 9-point grids and keeps the best fit. D is the whole drop.

Over the same 336 wheels, the fitted drop averaged 100.2% of the true drop (standard deviation 1.5%, range 97.4% to 108.2%). No speed band was more than 0.8% off. Five revolutions after the ball tested better than four, six or seven. That choice was tuned on these same simulated wheels, so it may be slightly flattering.

## What it did to the fits

The record now has a bit per wheel saying "this drop is whole", and the Pi gives those drops full weight with no recovery model at all.

| simulated, worst build | lowest revolution | pulse-time fit |
| --- | --- | --- |
| calibration drill, speed efficiency error (18 builds) | 3.9% | 1.9% |
| calibration drill, spin efficiency error | 11.7% | 6.6% |
| drill re-planned from its own shots, worst landing (12 builds) | 1.18 m | 0.74 m |

One problem is still open. The speed efficiency now reads 0.9% to 1.9% high on every one of the 18 builds. Because it never reads low, it is a bias, not noise. We haven't found the cause yet; our first suspect is the 10 ms steps of the loop's motor command, which a parabola can't follow.

## What this doesn't show

All of these figures come from the simulator, and its tach is exact to the microsecond. A real hall or IR sensor's timing jitter will add noise, a real ESC may recover in a shape no parabola fits, and we haven't timed the fit on a real ESP32. The first real check is a calibration drill logged next to a radar gun. Code, sweeps and their outputs are in the venture's [firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md), under "The drop from the pulse times".
