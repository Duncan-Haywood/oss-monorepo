---
title: "Do chip-search guarantees survive bigger designs? Conformal shortlists keep coverage and lose their savings"
date: 2026-10-25
description: "Rerunning a conformal shortlist and a pilot-checkable regret bound on five larger open-source chip designs: coverage holds near nominal, the saving shrinks."
tags: [research, verified-dse, conformal-prediction, openroad, multi-fidelity]
---

The [verified-dse](../../research/verified-dse/README.md) programme asks how much
of an ABC pass-sequence search a cheap fidelity rung can replace, with a guarantee.
Earlier milestones built two guarantees on ten small designs: a conformal shortlist
that decides which points to route, and a bound on successive halving's regret that
a small routed pilot can check. Both were rerun on the five larger designs from the
previous milestone (16 to 32-bit multipliers, 64-bit adders; routing 25x the cost of
the cheapest rung).

- **Coverage held.** A 16-point pilot with the mapped rung covers the near-best
  point 0.905 of the time at a nominal 0.9. At the 0.8 target it covers 0.747
  (0.87 with a 2% tolerance), slightly under, with ten groups and wide intervals.
- **The saving shrank.** The shortlist routes about 0.5 to 0.68 of a 50-point pool,
  against 0.45 on small designs, and its edge over random search with the same
  budget fell from about 0.35 to 0.12 coverage.
- **The pilot bound is valid and uninformative.** It covers in all 20 cells
  (minimum 0.81), but is 0.13 to 0.51 log units wide, so only a near-constant
  ripple adder gets a usable bound.

Five designs, three of one family, one corner, pools of 50: the next steps are a
second corner and a non-arithmetic family. Log: `research/verified-dse/LOG.md`.
