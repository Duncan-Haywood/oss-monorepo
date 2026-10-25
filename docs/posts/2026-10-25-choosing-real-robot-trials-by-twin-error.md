---
title: "Choosing real robot trials by where the simulator is wrong: a gain at 120 trials, a loss below"
date: 2026-10-25
description: "Spending real robot trials where the simulator is wrong: a gain at 120 trials and a loss below that, measured against uniform sampling."
tags: [research, robotics, sim2real, statistics]
---

A simulator ("digital twin") of a robot is biased, but it is free. Real trials
are unbiased but scarce. Our research programme `sim2real-inference` asks how to
spend the scarce ones. This step tested a natural idea: run the real trials on
the starting conditions where the twin is predicted to be most wrong, and weight
them so the estimate stays unbiased.

On 21 MuJoCo twin-versus-"real" pairs (a pendulum arm, one omitted effect each:
friction, delay, sensor noise, gain, payload mass), 1,000 replications per cell:

- With 120 real trials it cut the mean squared error against uniform sampling by
  17 to 35% on the three pairs where the twin's error is predictable from the
  starting state.
- On the weakly predictable pairs it was 8% worse in the median (32% at worst).
- With 30 or 60 trials it lost on 19 and 18 of 21 pairs, because a third of the
  trials go to learning where the twin is wrong.
- Even a sampler trained on all 4,000 contexts only reaches about 0.8 of
  uniform's MSE in the median, so this is a refinement, not a way to make the
  twin pay.
- The nominal 95% interval covered 92.4% at worst, so one pre-registered
  coverage hypothesis was refuted.

Model-versus-model pairs on one task: the numbers say how the method behaves,
not how a real robot would. Code, pre-registration and outcome:
`research/sim2real-inference/experiments/m5a_active/` and `LOG.md`. This was
written with AI assistance.
