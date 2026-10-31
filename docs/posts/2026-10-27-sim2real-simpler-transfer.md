---
title: "A simulator worth ten real trials is worth five for a new policy on a new task"
seo_title: "A simulator worth ten real trials is worth five on a new task"
date: 2026-10-27
description: "On SIMPLER's robot tables a calibrated simulator is worth about 10 real trials, but only if it has seen the policy and task elsewhere; held out, far less."
tags: [sim2real-inference, robotics, simulation, statistics]
---

[sim2real-inference](../../research/sim2real-inference/) asks how many real robot trials a biased simulator can replace. On the 36 policy-by-task cells of SIMPLER's published tables (Li et al. 2024), a calibrated simulator is worth about 10 real trials.

That figure comes from leave-one-cell-out calibration, which has already seen the held-out cell's policy and task in other cells. We re-ran it holding out more. Holding out a whole task changes nothing (10.3 trials). Holding out the policy drops it to 7.1. Holding out both makes the calibrated twin worse than the raw one (squared error 0.0290 against 0.0212; 4.8 trials). Resampling tasks and policies rather than cells also widens the interval for the headline from [5, 26] to [2.7, 54].

So the honest summary is "about ten trials, plausibly three to fifty", and for a genuinely new policy on a new task, skip the calibration. Caveats: 36 cells, 7 policies, 8 tasks, two robots, and the intervals overlap, so the ordering of schemes is a point estimate. Numbers: `experiments/m4c_cluster` and `m4e_transfer` in the project; the paper abstract now states them.
