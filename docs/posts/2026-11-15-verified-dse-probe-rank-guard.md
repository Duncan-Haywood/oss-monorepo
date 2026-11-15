---
title: "Chip design search: a cheap ranking fails at its own top, so random spot checks miss it"
seo_title: "Why random spot checks miss a misleading chip-flow ranking"
date: 2026-11-15
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Replayed on 90 Yosys and OpenROAD cells, a guard that spot-checks four random points does worse than no guard: 5.14% regret against 4.77%."
---

The [verified-dse](../../research/verified-dse/) programme searches over ABC
logic-synthesis pass sequences in an open chip flow (Yosys, ABC and OpenROAD on
SKY130). Its working rule ranks every candidate by a cheap, clipped score from
the mapped netlist and pays for place-and-route only on the best 8. On most
designs that beats spending the same time routing random candidates. On some
wide shifters it loses badly.

For seven steps we tried to predict those shifters from the RTL: the shift
operator, the share of multiplexers, and how many operations or gates sit in
front of the shift amount. Each rule was placed on designs we had already seen,
and each failed or moved on the next blind test. The
[last one](2026-11-14-verified-dse-gates-not-cells.md) found the same family
winning at 28 gates and losing at 36.

So this step stopped guessing and measured. The idea: route 4 randomly drawn
candidates in full, check whether the cheap score puts them in the same order
as the routed result does (Kendall tau-b), and trust the cheap ranking only if
it does. Otherwise spend the rest of the budget on random candidates. Every
rule spends the same wall-clock. We wrote the rule and six predictions into the
repository before computing anything, then replayed it on all 90 cells of the
last seven steps. No new flow run was needed.

| rule | mean regret over 90 cells |
|---|---|
| best of "ranking" or "random" per cell (oracle, a floor) | 2.42% |
| gate-depth guard (placed on most of these cells) | 3.91% |
| cheap ranking, no guard | 4.77% |
| **spot-check guard, 4 random probes** | **5.14%** |
| equal-cost random routing | 5.44% |

Regret is how far the best routed candidate a rule finds sits above the best
in the pool. Three of the six predictions held; the three that mattered failed.
The guard is worse than no guard, and it hardly ever backs off where it
should: it falls back to random in 12% of draws on the 17 cells where the
ranking loses, and in 7% on the 40 where it wins.

The reason showed up when we looked afterwards (so treat it as a description,
not a test). Over all of a cell's candidates, the cheap score's order agrees
with the routed order about as well where the ranking fails (tau-b +0.45) as
where it works (+0.53). The difference is at the top. Among the cheap score's
own 16 best candidates, the tau-b is -0.18 on failing cells and +0.23 on
winning ones. The ranking is fine in general and wrong exactly where we use
it. Four random probes almost never land in that top slice, so they cannot
see the problem.

That matches an older result in the same programme: an unclipped version of
this check failed the same way in milestone 111. Two negative results close
off random spot checks. The next step is to check the top: route a few of the
ranking's own best candidates next to a few random ones, and trust the ranking
only if its picks win. We will register that rule before replaying it.

Code, the full per-cell table and the log:
[`experiments/pilot_rank/`](../../research/verified-dse/experiments/pilot_rank/results.txt),
[`LOG.md`](../../research/verified-dse/LOG.md) (milestone 126). The results come
from one tool version, one process corner and replayed cells we had seen
before; a blind test is still to come.
