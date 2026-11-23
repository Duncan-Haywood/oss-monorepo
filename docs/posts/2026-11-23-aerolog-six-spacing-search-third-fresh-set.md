---
title: "Drone altitude layers: a six-spacing search keeps every fresh draw within 5% of the full planner"
seo_title: "Drone altitude layer spacing: six-spacing search, tested"
date: 2026-11-23
tags: [research, uav, airspace, optimisation]
description: "On a third set of 24 fresh layouts, searching two band counts below the leak budget and three above held 7 of 8 pre-registered predictions."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) is working out how far
apart delivery-drone altitude layers should be when each operator's airframe
carries its own barometric offset. The planner's rule is a *leak budget*. It
picks the most layers whose average chance of two drones one level apart losing
vertical separation stays under about 3%. Then it runs a short search around
that band count instead of the full 1,600-descent planner.

The [previous run](2026-11-22-aerolog-one-sided-spacing-search-second-fresh-set.md)
tried a lopsided search (one band count below the budget's, three above). It
won where the misses usually are, on the thin side, and lost one rare draw on
the other side. After seeing that, it proposed the union, two below and three
above (S6, 300 descents). That proposal came from three data sets it had
already looked at, so it needed a fourth.

## The test

This run built 24 layouts nobody had looked at (192 offset draws) with the same
generator and pipeline, and the budget stayed frozen at 0.027. Eight
predictions and the reading were committed and pushed before any layout was
built ([`fresh_tail3.py`](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail3.py)).
The script also says one thing up front: S6 contains both narrower searches,
so it can never be worse than either on any draw. The predictions were about
how much it gains and whether its worst case stays under 5%.

## What came out

Seven of eight held
([results](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail3_results.txt)).
Each entry is the cost ratio to the full search, p90 (worst draw):

| rule | 12 ops, 1× | 12 ops, 2× | 16 ops, 1× | 16 ops, 2× |
|---|---|---|---|---|
| three spacings (150 descents) | 1.0171 (1.092) | 1.0006 (1.069) | 1.0133 (1.020) | 1.0418 (1.079) |
| five spacings W (250) | 1.0055 (1.017) | 1.0000 (1.027) | 1.0133 (1.020) | 1.0156 (1.045) |
| six spacings S6 (300) | 1.0055 (1.017) | 1.0000 (**1.007**) | 1.0133 (1.020) | **1.0092** (1.045) |

The worst draw S6 gives up anywhere is 4.5%. All seven of the three-spacing
rule's bad draws had their best plan two or three band counts *thinner* than
the budget's. The one prediction that failed was the hope that the rare
other-side draw from last time would come back. It did not, so on this set
the extra band count below the budget bought nothing.

Pooled over all 72 fresh layouts (576 draws), S6 matches a 600-descent search
over every band count in each cell's p90 and worst draw. No fresh draw costs
it more than 4.9%, against 11.1% for the five-spacing search. By the rule
fixed in advance, S6 becomes the planner's default.

## What it means and what it does not

For a practitioner, the advice is now concrete. Compute the leak budget's band
count from the measured offsets, then search two band counts below it and
three above. That is a fifth of the full planner's work.

This is still simulated: one city's destinations, five measured flights for
the offsets, a conflict model without avoidance, and synthetic layouts. It is
preliminary. With the rule settled, the programme's next steps leave this knob:
offsets at delivery cruise speeds, the layered-airspace literature the paper
draft still has to read in full, and a second city. Section 6.9 of the
[paper draft](../../research/aerolog-scaling/paper/airspace_layers.md) carries
the numbers.
