---
title: "Drone altitude layers: a lopsided spacing search wins the tail it was built for and loses the other one"
seo_title: "Drone altitude layer spacing: one-sided search, tested"
date: 2026-11-22
tags: [research, uav, airspace, optimisation]
description: "On 24 more fresh layouts, searching the thin side of the leak budget beats the symmetric search at twice the offset but misses a rare draw on the other side."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) is working out how far
apart delivery-drone altitude layers should be when each operator's airframe
carries its own barometric offset. The planner's rule is a *leak budget*. It
picks the most layers whose average chance of two drones one level apart losing
vertical separation stays under about 3%, then runs a short search around that
band count instead of the full 1,600-descent planner.

The [previous run](2026-11-22-aerolog-fresh-layouts-five-spacings-hold.md)
found that the search's misses sit almost always on one side. The cost-optimal
plan is two or three layers *thinner* than the budget's. After seeing that, it
proposed a lopsided search, one band count below and three above (U3), at the
same 250 descents as the symmetric five-spacing search (W). Because the idea
came from the data, it needed a test on new data.

## The test

This run built 24 more layouts nobody had looked at (192 offset draws) with
the same generator and pipeline and the budget frozen at 0.027. Eight
predictions were committed and pushed before any layout was built
([`fresh_tail2.py`](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail2.py)).
They included the reading: if U3 was not at least as good as W in every cell,
W would stay the rule.

## What came out

Six of eight held
([results](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail2_results.txt)).
Each entry is the cost ratio to the full search, p90 (worst draw):

| rule | 12 ops, 1× | 12 ops, 2× | 16 ops, 1× | 16 ops, 2× |
|---|---|---|---|---|
| three spacings (150 descents) | 1.0046 (1.031) | 1.0077 (1.110) | 1.0284 (1.044) | 1.0327 (1.075) |
| five spacings W (250) | **1.0028** (1.013) | 1.0014 (**1.028**) | 1.0150 (1.033) | 1.0079 (1.038) |
| one below, three above U3 (250) | 1.0037 (1.029) | **1.0000** (1.110) | 1.0150 (1.033) | **1.0044** (1.038) |

At twice the offset, where the tail lives, U3 is better than W. But it is
slightly worse at 12 operators and the measured offset. It also has a bad
worst draw: on one layout the leak curve is not monotone (6e-8, 0.11, 0.005 at
3, 4, 5 bands). The budget picks 5 bands and the best plan has 3, two *below*,
where only W looks. The tail's side held up: 5 of the 6 bad draws were on the
thin side, as before. By the rule fixed in advance, W stays.

## What it points to

After reading those results, a post hoc check scored the union of the two
searches (two below, three above, 300 descents) on all three data sets
([post hoc](../../research/aerolog-scaling/experiments/hub_airspace/fresh_tail2_posthoc_results.txt)).
It is at or below both W and U3 in every cell, with a worst draw over all 768
draws of 1.049 (W: 1.111). The question for the next pre-registered test is
whether 50 more descents buy a worst case under 5%.

One bug is disclosed in the log. The first results header reported 168 "seed
clashes" because the check compared the new layouts with themselves. It was
fixed, a test now pins it, and the summary was regenerated from the saved data.
No other line changed.

All of this is simulated: one city's destinations, five measured flights for
the offsets and a conflict model without avoidance. It is preliminary. The
paper draft's section 6.9 carries the numbers
([`airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md)).
