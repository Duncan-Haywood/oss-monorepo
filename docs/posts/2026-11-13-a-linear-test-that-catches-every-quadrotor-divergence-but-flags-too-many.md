---
title: "A linear stability test caught every divergence in our canted quadrotor simulations, and flagged too many"
date: 2026-11-13
tags: [codesign-cant, quadrotor, stability, feed-forward, pid, linearisation, research]
description: "An 11-state linear model of a canted quadrotor's control loop missed no divergence in 3,456 simulated flights, but flagged 300 flights that held on."
seo_title: "Linear stability check for a quadrotor side-force feed-forward"
---

[This morning's step](2026-11-13-a-drones-integrator-knows-the-side-force-but-only-if-you-retune.md) left an open question. Feeding forward the attitude integrator's torque cancels a canted quadrotor's side force when the controller is retuned with it, and runs away when it is added to an existing tune. A gain ratio told the two apart, but only after we had seen the results. Was there a rule we could have computed beforehand?

We wrote the simulator's control loop out as a linear map. Around hover, every 2 ms step of the simulation is linear in eleven numbers: position, velocity and its integral, tilt and the one-step-old tilt the controller reads, body rate and its old copy, the attitude integrator, the torque coming through the motor lag, and the two states of the other feed-forward. The side force adds to the tilt's push on one horizontal axis and fights it on the other, so both axes have to be stable. A test runs the full simulator and the linear map side by side from a 0.1 mm offset; they agree to one part in a thousand. Six predictions went into the log before we scored anything.

**It is a necessary test.** Each of the 64 held-out flights has its own randomised mass, motor lag and torque. Across 84 design-and-controller combinations, no flight the model called stable at its own plant diverged. That was 0 of 2,688 with the integrator feed-forward or none, and 1 of 758 with the older commanded-torque feed-forward. Every diverged flight had been called unstable.

**It is not a sufficient one.** It called 300 more flights unstable that did not diverge. All of them come from the bolted-on designs, which the model calls unstable at every plant. Between 11 and 44% of those designs' flights diverged, and the rest held position at about twice the usual error. We had predicted at least 95% accuracy. We got 90%. Afterwards we checked how fast each instability grows. That rate ranked the designs by how often they diverged (Spearman 0.83), but it was not part of the test we set.

**The optimiser had found the edge by itself.** The model gives each design a ceiling: the largest integral-to-proportional gain ratio that stays stable at all eight corners of the plant randomisation. The designs retrained with the feed-forward sit at 0.88 to 1.11 times their ceiling. The bolted-on ones sit at 2.3 to 3.4 times theirs. Sixteen training flights were enough for CMA-ES to push the integral gain up to the boundary. They were not enough to keep it any distance away.

**So keep a margin.** We built twelve new controllers that no earlier step had seen. Each took one of the six old designs and set its integral gain to 0.8 or 1.25 times its own ceiling. At 0.8 times, nothing diverged and position error matched the design without a feed-forward (0.10 m). At 1.25 times, the model calls 80 to 100% of flights unstable, yet none diverged and error rose only to 0.11 m. That instability grows slowly, about 0.5 to 0.7 per second, and something in the nonlinear loop keeps it bounded. Our guess is the integrator's clip, but we have not tested that.

One honest note: the first run called every design marginally unstable. A state that the integrator mode never updates sat in the map with an eigenvalue of exactly one. The test against the simulator could not see it, because nothing reads that state. We fixed it, added a test for it and logged it before reading off any verdicts.

The rule for a builder: if you add the integrator feed-forward, compute the gain ceiling at the corners of your plant uncertainty (a few milliseconds per design) and tune to about 0.8 times it. All of this is simulated and linearised about hover, and it uses the programme's assumed gust lever and plant ranges. Code, results and predictions are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
