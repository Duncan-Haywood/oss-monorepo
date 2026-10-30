---
title: "A small learned surrogate does worse than random search on chip-flow design points"
date: 2026-10-26
description: "A ridge regression of routed cost on cheap-rung features, refitted as points are routed, loses to random routing and to never cutting on the cheap rung."
tags: [verified-dse, research, eda, multi-fidelity]
---

Milestone 20 of the [verified-dse](../../research/verified-dse/) programme asks whether a learned model across fidelity rungs beats the simple policy found earlier ("never cut on the liberty-mapped rung R2"). The model: screen points at R2, route five through placement and routing, fit a ridge regression of log routed area-delay product on R2 area and R2 period, then route the best-predicted point, refit, repeat. It runs on the committed flow tables (20 designs, two clocks, 400 paired seeds), with no new flow run.

- Mean regret against the best routed point at 15, 25 and 40 routed-point equivalents: surrogate 4.80, 3.08, 1.71%; random routing 3.40, 1.68, 0.38%; never cutting on R2 3.05, 1.35, 0.44%.
- Using one feature (R2 area-delay product) instead of two is slightly better, not worse (4.58, 2.95, 1.43%). Both predicted outcomes in favour of the richer model were refuted.
- On barrel64 the surrogate stays at 19% regret at the largest budget: it learns R2's mis-ranking and, being greedy, never routes a point that would correct it.

This is a negative result for the smallest model-based baseline only. It has no uncertainty term, so it is not Bayesian optimisation; adding one, and R3 features, is the next step. Log entry: [LOG.md](../../research/verified-dse/LOG.md).
