---
title: "Battery-design triage saves DFN cycles again on a second batch of never-simulated cells"
seo_title: "Battery DFN triage holds on a second fresh batch of designs"
date: 2026-11-19
tags: [research, batteries, pybamm, simulation-budget, replication]
description: "A drift-score rule that runs only flagged battery designs to 50 DFN cycles met its accuracy target 9 of 12 times on 64 new designs, at 21% less compute."
---

The [cell-fidelity](../../research/cell-fidelity/) programme asks how a
lithium-ion electrode design search can spend less on the full DFN battery
model without losing accuracy where it matters. Its current rule is simple:
simulate every candidate design for ten cycles, compute a drift score from
those ten cycles, and run only the designs with a high score on to cycle 50.
The rest get their cycle-99 lithium-loss forecast from ten cycles alone.

Earlier today the rule's frozen policies were tested on 32 designs that no
step had simulated, and met the accuracy target in 9 of 12 cases at 17% fewer
DFN cycles. That test raised two worries: the drift score ran higher on two
of the four parameter sets' new designs, so an absolute threshold flagged
more than it was set to, and two misses came from a 40-cycle extension that
was too short.

This step simulated 64 more designs (16 per parameter set, PyBaMM 26.10.1.1,
100 cycles each) and scored rules fixed before the bench ran, including a new
one built to fix the scale problem: a threshold relative to each batch's
median drift score, always extended to 50 cycles.

## What came out

Target: the batch's upper-quartile cycle-99 lithium-loss error may be at most
1.25 times what running every design to 50 cycles gives. Cost: DFN cycles per
design (all-50 costs 50).

| rule | how scored | met | DFN cycles | saved |
|---|---|---|---|---|
| frozen threshold policies (from 7f) | the 64 new designs | 9 of 12 | 39.3 | 21% |
| relative threshold, extend to 50 | refit on 4 pools, new designs | 4 of 4 | 40.6 | 19% |
| absolute threshold, extend to 50 | refit on 4 pools, new designs | 3 of 4 | 40.0 | 20% |
| absolute threshold | each of 5 pools held out | 19 of 20 | 43.5 | 13% |
| relative threshold | each of 5 pools held out | 18 of 20 | 42.1 | 16% |
| uniform run length | each of 5 pools held out | 19 of 20 | 48.0 | 4% |

So the saving replicated: 9 of 12 frozen policies met the target on both
fresh batches, at 17% and then 21% fewer DFN cycles, and the same two
permissive policies missed both times. With five pools to set the margin,
the drift-score threshold holds the target as often as a uniform run length
does and saves about three times as much.

## The fix that wasn't needed

The relative threshold was meant to keep the share of designs flagged steady
from batch to batch. It did not: its flagged share moved by 0.095 on average
between training and the new batch, against 0.069 for the plain threshold, so
that hypothesis is refuted. On this batch the drift score's scale sat back
near the earlier pools', so there was little drift to absorb, and the median
of 16 designs moves the relative cut by itself. Since it does no better and
needs a whole batch before it can score one design, the plain threshold stays
the rule.

## Limits

Four parameter sets with 16 new designs each; only the four folds holding
out the new batch are blind (the other 16 leave-one-pool-out folds reuse pools
seen before); one degradation law; modelled fade, no measured cells. Plan,
verdicts and numbers are in the project's
[log](../../research/cell-fidelity/LOG.md) and
[results](../../research/cell-fidelity/experiments/fresh7h/results.txt).
