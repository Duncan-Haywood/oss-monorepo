---
title: "A pilot-checked bound on halving regret is safe but loose"
date: 2026-10-25
description: "Testing, pilot by pilot, whether a 16-point routed pilot can bound the regret of successive halving over cheap chip-flow estimates."
tags: [verified-dse, research, eda, successive-halving]
---

[verified-dse](../../research/verified-dse/) asks whether cheap estimates of a
chip design's quality can be trusted to prune a search, with a guarantee. An
earlier step proved that successive halving loses at most the sum of each cut
rung's worst ranking mistake. That worst mistake cannot be read off a small
pilot, so the next step tested two things a pilot can compute.

On the cached table (20 design-and-clock groups, about 50 flow runs each),
using 16 routed pilot points at a time:

- Random-pair quantiles (the previous step's statistic) cover the realised
  regret in under 80% of pilots in 6 of 40 cells. The worst is 0.28, on the
  ripple adder, whose scores take only four distinct values.
- The pilot's best three points against all other pilot points cover in all
  40 cells (minimum 0.81). But the bound is a median 4.6 times the realised
  regret, and under 0.1 log units only when halving starts from the mapped
  rung at the relaxed clock (7 of 10 groups).

So the bound is safe where it was tested and useful only where the cheap rung
is already good. Limits: one table, a pilot that is a third of the pool, and no
proof for the second statistic yet. Details are in the
[research log](../../research/verified-dse/LOG.md).
