---
title: "Read a drone's attitude lag off one lean step, and predict its rise time with no position fit"
seo_title: "Quadrotor attitude lag from one acceleration step"
date: 2026-11-20
tags: [research, robotics, drones, quadrotor, control, system-identification]
description: "A simulated quadrotor's lean lag, read off one acceleration step (63% time, ~180 ms), predicts 36 of 36 tunes' rise times within 0.1 s with nothing fitted."
---

Yesterday our [rotor-cant co-design programme](../../research/codesign-cant/README.md) found that a twenty-line point-mass model predicts how fast a tuned, simulated 5-inch quadrotor rises to a 1 m position step, from its gains alone, to within 0.04 s. The model missed on short steps and hard acceleration caps, always the same way: the real vehicle (the full simulator) arrived sooner and overshot more. Adding one first-order lag between the acceleration the position loop asks for and the acceleration the frame delivers fixed most of it. The braking lean comes late.

The catch was where the lag came from. Its value, 135 ms, was fitted on a flown position step, which is the thing the model is supposed to predict. A builder can't use a constant that needs the answer first.

## One lean step instead

So this run measured the lag a different way. Each of the 36 tuned designs hovers, the position loop is cut out, and the horizontal acceleration request jumps to 3.5 m/s² and stays there for 2 s. We record what the vehicle actually achieves, over 64 randomised plants per design. Nine predictions were [committed before the run](../../research/codesign-cant/LOG.md). Four held.

What came back:

- **The lag is the attitude loop's, and it is longer than the fit said.** The vehicles reach 63% of their steady acceleration in a median 182 ms. The area under the step response's shortfall gives 171 ms. Swapping between the three identified motor laws (33 to 39.1 ms) moves no design by more than 10 ms. A 1 m/s² request instead of 3.5 moves none by more than 15 ms.
- **That lag predicts rise time better than the fitted one.** With each design's 63% time plugged in, the lagged point mass gets all 36 designs within 0.10 s in all seven conditions from yesterday. That includes the hard cases: an 8 m/s² cap (median error 17 ms, against 35 ms with the fitted lag and 85 ms with none) and a 0.5 m step (11 ms, against 20 and 62).
- **One number per airframe class is enough.** A single pooled lag, the median of the 36, does about as well as each design's own.

Why did the fit come out short? Its search stopped at 150 ms, and the in-sample error is nearly flat between about 130 and 200 ms (6 ms of error at 135 ms, 4 ms at 190 ms). The step response also isn't first order. About a fifth of the request arrives within 50 ms, before the frame has leaned far. That is most likely the canted rotors' sideways thrust, which follows the motor torque directly, though we didn't isolate it. Then the lean builds, reaching 95% at half a second.

![Left: achieved over steady acceleration after a 3.5 m/s² request step for the designs with the shortest, median and longest lag, against a 171 ms first-order lag. Right: median rise-time prediction error per condition for no lag, the fitted 135 ms lag, and the two identified lags.](../../research/codesign-cant/experiments/m7ah_att_step/m7ah_att_step.png)

## What a builder does with it

With a capped, integrator-gated position loop:

1. Fly one acceleration step and read the time to 63% of the steady acceleration.
2. Integrate the [point mass](../../research/codesign-cant/experiments/m7ag_cruise/cruise_model.py) with that lag.

That predicts the step response's rise time before any position flight. It is now the builder's rule in section VII of the paper draft.

## What this doesn't show

Everything here is simulated, in one simulator whose attitude loop is the simplified one the programme has used throughout. The lags were measured without looking at the rise times, but they were scored against flights published yesterday, not new ones. The results come from one evaluation seed, in calm air. Two of the misses were narrow: the area estimate fell one design short at the 0.5 m step, and against the no-lag model it tied at the gentlest cap rather than winning.

Code, results and verdicts: [`experiments/m7ah_att_step/`](../../research/codesign-cant/experiments/m7ah_att_step/run.py).
