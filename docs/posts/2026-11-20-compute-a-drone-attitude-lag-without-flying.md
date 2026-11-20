---
title: "Compute a drone's attitude lag from its gains, and predict its rise time with no test flight"
seo_title: "Quadrotor attitude lag from a linear model, no flight"
date: 2026-11-20
tags: [research, robotics, drones, quadrotor, control, linearisation]
description: "A linearised attitude loop, averaged over the plant range, gives a simulated quadrotor's acceleration lag to 0.5 ms and its rise time for 36 of 36 tunes."
---

Earlier today our [rotor-cant co-design programme](../../research/codesign-cant/README.md) showed that you can [read a drone's attitude lag off one lean step](2026-11-20-read-a-drone-attitude-lag-off-one-lean-step.md). Hover, cut the position loop, step the horizontal acceleration request, and time how long the vehicle takes to deliver 63% of it. Put that lag into a twenty-line point-mass model of the position loop, and it predicted the rise time of all 36 tuned designs within 0.1 s in seven conditions.

That still takes one flight per design. And it left two oddities. About a fifth of the request arrived within 50 ms, before the frame could lean far. And the steady acceleration came out about 6% above what was asked for. This run asked whether the flight is needed at all, and what caused the two oddities.

## The model was already in the repository

Milestone 7c of the programme wrote an 11-state linearisation of the simulator's horizontal axis: position, tilt, rates, the attitude integrator, the motor lag and the canted rotors' sideways force. It was built to certify stability. Set its position gains to zero, feed it a constant acceleration request, and it gives the same step response the probe flew, without flying anything.

One question was which plant to linearise. The tuner trains on randomised plants: torque scale 0.7 to 1, mass 0.9 to 1.3, motor lag 1 to 2 times nominal. A builder knows that range but not the draw. So we averaged the linear response over a 3 by 3 by 3 grid of the range. Nine predictions were [committed before the full run](../../research/codesign-cant/LOG.md), after a smoke run on a different seed. Seven held.

![Left: lag from the linear model against the lag read off a flown step for 36 designs; the area estimates sit on the equal line, the 63% times on it except one outlier. Right: for the median design, flown and linear responses overlap, with and without the side force.](../../research/codesign-cant/experiments/m7ai_lag_model/m7ai_lag_model.png)

What came back:

- **The lag is computable.** The averaged linear model matches each design's flown area lag (the mean delay of the response) within 10 ms for 36 of 36 designs. The median difference is 0.5 ms. Its 63% time is within 15 ms for 34 of 36.
- **Rise time needs no flight.** Plug the computed 63% time into the point mass, and all 36 designs land within 0.1 s of their flown rise in all seven conditions. That includes an 8 m/s² acceleration cap and a 0.5 m step. Median error is never more than 1 ms worse than with the flown lag.
- **Average over the range.** At the nominal plant alone, the 63% time is within 15 ms for only 18 of 36. The area lag barely notices the plant, but the 63% crossing moves with the response's shape.

## The two oddities

**The early jump is the side force.** A canted rotor's thrust has a sideways component that follows the motor torque straight away, before the frame has rotated. Switch it off in the simulator and the share of the request delivered at 50 ms falls from a median 0.22 to 0.10. The linear model gives the same pair, 0.21 and 0.10. It isn't a small effect on the lag either: without the side force, the 63% time moves by more than 15 ms for 28 of 36 designs, by up to 179 ms. A lag measured on a flat frame won't carry over to a canted one with the same gains. We predicted that every design would stay at or below 0.15 at 50 ms without the side force. One reached 0.156, so that prediction failed by a hair.

**The overshoot was the lean map plus a short window.** The controller turns an acceleration request into a tilt with the small-angle rule θ = a/g. Swap in the exact arctan(a/g), and the steady excess falls from 6.2% to 1.7% at 3.5 m/s². What remains is a slow ring of the loop, still decaying at the end of the 2 s window. The linear model reproduces it within 0.01 for every design.

One catch for anyone copying the rule: the 63% time is fragile. One design's sideways-force spike crosses 63% at 30 ms and falls back, so its flown "63% time" is 30 ms while its area lag, flown or computed, is 208 ms. The area estimate has no threshold to trip on.

## What a builder does with it

For a capped, integrator-gated position loop on this kind of simulated vehicle:

1. Linearise the attitude loop with the rotors' side force included, at a grid over the plant range you randomise across.
2. Step its acceleration input, average the responses, and read the 63% time (check it against the area lag; if they disagree badly, use the area lag).
3. Integrate the point mass with that lag to get the rise time for any cap and step size.

No flight is needed for any of it. The code is `linstab.accel_step` in the [project source](../../research/codesign-cant/README.md), MIT licensed.

## Limits

This is a simulated result about a simulator. The linear model is that simulator's own linearisation, so the run shows the simulated lag is computable, not that a real airframe's would be. A real attitude loop would need its own model, or one flight. Hardware checks are the programme's milestone 8. One evaluation seed, 64 episodes per design, and the rise times scored were already published by an earlier milestone. Written with AI assistance (Claude Code).
