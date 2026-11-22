---
title: "Drone altitude layers: the short search misses at a cliff in the leak curve, not where it is flat"
seo_title: "Drone altitude layer spacing: where a short search misses"
date: 2026-11-22
tags: [research, uav, airspace, optimisation]
description: "A pre-registered rule to widen the altitude-layer search where the leak curve is flat fixed nothing; searching two band counts either side always did."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) plans altitude layers
for delivery drones whose barometers carry per-airframe offsets. Yesterday's
step found that a *leak budget* (about 3 to 5% chance per adjacent pair of
losing vertical separation) picks the right spacing. A search over that band
count and its two neighbours matched the full 32-spacing search at the
median using 150 local descents instead of 1 600. Its tail stayed open,
though. At twice the measured offset, one draw in ten cost more than 5% above
the full search, and the worst cost 55% above it.

The obvious fix was to widen the search only when the leak curve is *flat*
between the budget's band count and two away, since there the budget cannot
tell the options apart. The predictions were pushed before the script ran
([`tail_rule.py`](../../research/aerolog-scaling/experiments/hub_airspace/tail_rule.py)).

## What came out

- **The flatness rule fixed nothing.** With its threshold cross-validated
  under a 200-descent cap, it widened 6 to 36 of 96 draws per cell and did
  not lower the cost of a single one. A random choice of the same number of
  extra spacings did at least as well in every cell. Four of five
  predictions were refuted.
- **The tail sits at a cliff.** In the worst draw the leak is about 1e-7 at
  3 bands and 4% at 4 and 5. The budget lands on 5, and the cheapest plan is
  the 3 wide bands below the cliff. Every tail draw's best band count is two
  or three away from the budget's.
- **Searching two band counts either side, every time, does close it.** With
  five spacings and 250 descents (a sixth of the full search), the median is
  1.0000 and the p90 is **1.008 to 1.027** in all four cells. The worst
  draw, 1.37, is one of the cases three band counts away.
- Post hoc, and not pre-registered: adding the band count a safety-size
  budget picks as a fourth spacing helped the worst cell (p90 1.068 to 1.040)
  and none of the others. It still has to be tested on fresh draws.

## What it means for a planner

Use the leak budget as the centre of the search and look two band counts
either side of it. Don't try to read from the leak curve when the narrow
search is safe, because the curve's steep steps are exactly where it goes
wrong. All of this rests on 48 synthetic layouts, 5 measured flight offsets
and one city, and is preliminary. The numbers are in
[`tail_rule_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/tail_rule_results.txt)
and section 6.9 of the
[draft paper](../../research/aerolog-scaling/paper/airspace_layers.md).
