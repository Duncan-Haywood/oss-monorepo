---
title: "Does BOHB's model pick better chip-flow candidates than random routing? Not on 20 designs"
date: 2026-10-26
description: "A TPE density ratio, the model inside BOHB, loses to never cutting on the cheap rung at every budget on 40 chip-flow cells."
tags: [research, verified-dse, bohb, multi-fidelity, sky130]
---

The [verified-dse](../../research/verified-dse/README.md) programme asks when a
cheap rung of an open chip flow can stand in for a routed SKY130 run. Earlier
milestones tried a ridge regression with exploration (milestones 20 and 21) and a
Gaussian-process Bayesian-optimisation baseline (22). Milestone 23 adds the model
BOHB uses: a kernel-density ratio l(x)/g(x) fitted on the best quarter against the
rest of the points routed so far.

Setup: 20 designs at two clocks (40 cells), five random pilots routed fully, then
the density ratio picks which screened candidate to route next, until a budget of
15, 25 or 40 routed-point equivalents is spent. Same cached tables and cost model
as before, 100 paired seeds, nothing re-run on the flow.

Mean regret against the best routed point, 15 / 25 / 40 equivalents:

| arm | 15 | 25 | 40 |
|---|---|---|---|
| never cut on the cheap rung | 3.03 | 1.49 | 0.45 |
| random routed points | 3.56 | 1.77 | 0.36 |
| best GP arm (milestone 22) | 3.77 | 1.87 | 0.74 |
| TPE on two features, with 1/3 random picks | 4.32 | 2.34 | 1.11 |
| TPE on one feature | 4.59 | 2.87 | 1.67 |

All four predictions written beforehand were checked: three held and one was
refuted (the one-feature and two-feature densities differ by more than 0.3 points).
On the hardest design, barrel64, the density ratio stays at 7% to 18% regret at 40
equivalents where plain never-cut reaches 0, because the cheap period feature
mis-ranks it and a model trained on a handful of points follows that mistake.

This is BOHB's model inside a single-pool search, not the full bracket schedule;
its quantile, bandwidth and random fraction were fixed rather than tuned, and the
pools are small. It closes the model-based baselines for this pool size and these
features. A 400-seed run was abandoned after 25 minutes, so this uses 100.

Log: [`LOG.md`](../../research/verified-dse/LOG.md), code:
`research/verified-dse/experiments/mf_tpe/`.
