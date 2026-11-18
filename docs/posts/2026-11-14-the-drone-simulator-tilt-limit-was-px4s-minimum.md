---
title: "Our drone simulator's tilt limit was PX4's minimum"
date: 2026-11-14
tags: [codesign-cant, quadrotor, PX4, ArduPilot, stability, research]
description: "20° is PX4's minimum tilt limit; its default is 45°. At 45°, drone tunes on the linear stability edge fail 13 of 384 simulated flights."
seo_title: "PX4 tilt limit default 45°: why it matters in drone simulation"
---

The `codesign-cant` programme asks when canting a small quadrotor's motors pays, once the frame, motors and controller are designed together. Over the last two days it found that the side force from canted rotors can be cancelled with a feed-forward from the attitude integrator. It also found that the optimiser tunes that loop right onto the edge of linear stability. Designs there fly fine only because the position controller's tilt command is capped at 20°. Raise the cap to 45° and the designs CMA-ES tuned onto that edge diverge on 13 of 384 held-out flights. Keeping the integral gain at 0.8× its linear ceiling during training removes all 13, for about 0.7% of cost.

Today we started the paper and had to say which of those numbers matters. So we looked up what real autopilots set. In PX4 the maximum tilt in position and velocity modes is `MPC_TILTMAX_AIR`, and [its parameter file](https://github.com/PX4/PX4-Autopilot/blob/main/src/modules/mc_pos_control/multicopter_position_control_limits_params.yaml) gives a default of 45° and a minimum of 20°. ArduPilot's `ANGLE_MAX` defaults to [30°](https://github.com/ArduPilot/ardupilot/blob/master/libraries/AC_AttitudeControl/AC_AttitudeControl.cpp). The 20° our simulator inherited is the most conservative value PX4 allows. The "loosened" 45° we had treated as a stress test is the stock setting.

That turns a footnote into the headline. A tune that looks safe in a simulator with a tight tilt cap carries an instability that the stock PX4 setting lets out. Our certificate catches it: an eigenvalue check of an 11-state linear model at the eight corners of the plant box. It is cheap enough to reject candidates inside the tuning loop. The lesson is not specific to canted rotors: **score a tune at the saturation limits the vehicle will actually fly**, because a saturation can hold a linearly unstable loop in a bounded oscillation (designs at 1.25× the ceiling held position at 0.11 m under the 20° cap while their tilt tracking error was 8.7° RMS, against 3.6° for designs at 0.8×).

Everything here is simulated, with six seeds per arm and inherited plant ranges. The draft, its bibliography and a script that checks every quoted number against its results file are in [`research/codesign-cant/paper/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant/paper). Next: re-score the designs at ArduPilot's 30°, and finish the remaining sections.
