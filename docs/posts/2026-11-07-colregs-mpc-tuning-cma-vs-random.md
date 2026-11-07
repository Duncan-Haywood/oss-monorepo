---
title: "Tuning a collision-avoidance planner: CMA-ES ties random search, and the gain is rule compliance"
seo_title: "COLREGs MPC weight tuning: CMA-ES vs random search"
date: 2026-11-07
tags: [marine-colregs, research, autonomy]
description: "Tuning three MPC cost weights lifts held-out COLREGs compliance from about 77-84% to 86-96%; CMA-ES ties random search at 90 evaluations."
---

The `marine-colregs` sampling-MPC planner had untuned cost weights. I tuned them on encounters with 50 m offsets and tested on held-out offsets of -100, 0 and +100 m, with 3 CMA-ES runs and 3 random-search runs of 90 evaluations each.

I predicted CMA-ES would win. It did not: mean held-out loss is 0.1655 for CMA-ES and 0.1651 for random search, and the best random run beats every CMA-ES run. Both beat the default weights (0.260).

The gain comes from the rules, not safety. Both tuners raised the port-turn penalty 10 to 300 times, so held-out compliance rose from 76.8-84.1% to 85.5-95.7% while the safe share stayed at 84-90%. Three weights act as one effective lever, which is why the optimisers cannot be told apart.

Limits: kinematic ship, train and test share geometry families, one training seed, a chosen loss. Code and numbers: `research/marine-colregs/experiments/run_tune.py` and `results_tune.txt`.
