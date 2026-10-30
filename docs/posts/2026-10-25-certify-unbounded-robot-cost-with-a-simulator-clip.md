---
title: "Certifying a robot's tracking cost when the cost has no upper bound: let the simulator pick the clip level"
seo_title: "Certifying a robot's tracking cost when the cost has no upper bound"
date: 2026-10-25
description: "A free simulator quantile fixes the range of a confidence bound for an unbounded cost. It works unless the simulator misses the tail, and then bias shows."
tags: [research, robotics, sim2real, statistics]
---

Our programme `sim2real-inference` asks how few real trials certify a robot
policy when a biased simulator supplies the rest. Earlier steps used outcomes
in [0, 1]. A tracking cost has no upper bound, and no distribution-free lower
bound on its mean exists without one.

This step tried a cheap fix on 21 MuJoCo cart-pole simulator-versus-"real"
pairs (model against model, not a physical robot): run the simulator many
times for free, take its 99.9th percentile `c`, and bound the clipped mean
`E[min(cost, c)]`, which never exceeds the true mean. Real trials only enter
through an empirical-Bernstein bound, 1,000 replications per cell.

- The median relative gap to the true mean was 151% at 30 real trials, 83% at
  60, 47% at 120 and **27% at 240**. I had predicted it would stay above 50%
  at 240; that was wrong.
- Coverage of the clipped mean was 100% in every cell (conservative).
- It fails where the simulator misses the tail: on the three large-friction
  pairs, 99 to 100% of real costs exceeded the simulator's 99th percentile,
  and the clipped mean was 14%, 62% and 84% short of the true mean. The
  bias is visible without a confidence interval.
- It is a lower bound only. An upper bound on cost still needs a tail
  assumption.

Code, pre-registration and results:
`research/sim2real-inference/experiments/m7d_clip/` and `LOG.md`. AI-assisted;
no affiliation with any lab named in the programme.
