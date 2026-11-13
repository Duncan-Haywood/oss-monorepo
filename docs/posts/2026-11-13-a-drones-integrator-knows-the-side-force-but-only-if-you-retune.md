---
title: "A drone's attitude integrator can cancel a canted rotor's side force, but only with a retune"
date: 2026-11-13
tags: [codesign-cant, quadrotor, co-design, feed-forward, position-control, pid, research]
description: Feeding forward only the attitude integrator's torque cancelled a canted quadrotor's side force with no extra crashes, on frames whose integrator carries the gust torque. Added to an existing tune, it ran away.
seo_title: "Cancelling canted quadrotor side force with the PID integrator: does it work?"
---

Canted motors give a quadrotor much more yaw authority. They also push the body sideways whenever the attitude controller makes roll or pitch torque. On a rigid frame in a steady wind, that side force adds to the wind push on one horizontal axis. In the `codesign-cant` simulations, the hurt axis held position 1.9 to 3.4 times worse than the other after a wind step.

[Yesterday's step](2026-11-12-cancelling-a-canted-drones-side-force-in-software.md) let the position loop predict the side force from the torque the controller had just commanded, and lean against it. That evened the two axes, but it fed the fast proportional and derivative torque back into the tilt reference, through the motor lag. A few flights diverged, and overall the fix did not pay.

The steady part of the side force comes from the steady counter-torque to the gust. A PID attitude loop already keeps an estimate of that torque: its integrator. So this step fed forward only the integrator's torque, with no filter, no new sensor and nothing for the optimiser to tune beyond the usual gains. We wrote nine predictions into the log first, then retrained the co-designed vehicles with it on: six seeds, two frame geometries, 64 held-out flights each.

**It worked on one geometry.** With the centre of pressure above the centre of mass, no held-out flight diverged at the design wind. Milestones 6b and 7 each had one. The hurt/helped error ratio went from about 2 to 0.83, a slight over-correction. Switching the feed-forward off on the same designs brought the split back (2.06), so the controller term did the work. With double the assumed gust lever, 15 of 384 flights diverged, against 23 without a feed-forward and 19 with yesterday's.

**On the other geometry it barely did anything.** With the centre of pressure below, the optimiser had tuned designs that hardly use the integrator. Their integral-to-proportional gain ratio is 0.05 to 0.28 per second, against 3.7 to 12.6 above. An integrator that holds little of the gust torque cannot predict much of the side force: the axis ratio only fell from 3.0 to 2.0. It was harmless there, with 2 diverged flights against yesterday's 8.

**Bolted onto an existing tune, it was dangerous.** We added it to the previous step's integrator-heavy designs without retraining. Those designs then diverged on 23% of held-out flights, even with no gust torque at all. Removing the fast path did not remove the loop: tilt reference to attitude error to integrator to predicted side force, and back to the tilt reference. That loop runs away slowly when the integrator gain is high. A simple steady-state criterion we tried afterwards did not explain which designs diverge, but the gain ratio did. The retrained designs had cut it to about 4 per second. That explanation is post hoc, from two families of designs, and needs a proper stability analysis.

For anyone building one: feed forward the integrator's torque only together with a retune, or with a cap on the integral gain. Never add it as a patch to a tune you already have. Cant itself still paid in every seed, with yaw error 5 to 8° lower than upright motors.

All of this is simulated, with an assumed centre-of-pressure lever, perfect altitude hold and six seeds. Code, results and the predictions are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
