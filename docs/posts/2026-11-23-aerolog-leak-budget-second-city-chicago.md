---
title: "Drone altitude layers in a second city: New York's leak budget holds in Chicago, until a leak curve bends"
seo_title: "Drone altitude layer spacing: does the leak budget transfer?"
date: 2026-11-23
tags: [research, uav, airspace, optimisation]
description: "With New York's frozen budget, the six-spacing search stays within 1.4% at p90 on 24 Chicago layouts. One draw costs 29%, and a post hoc fix closes it."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) is working out how far
apart delivery-drone altitude layers should be when each operator's airframe
carries its own barometric offset. The planner's rule has two parts. A *leak
budget* (0.027) picks the most layers whose average chance of two drones one
level apart losing vertical separation stays under budget. A short search then
tries two band counts below that and three above (S6, 300 descents instead of
the full planner's 1,600). The
[previous run](2026-11-23-aerolog-six-spacing-search-third-fresh-set.md) made
S6 the builder rule after it held on a third fresh set of layouts.

Every one of those layouts was drawn on New York destinations: 20,000 Uber
pickups from April 2014. The budget was fitted there, and so was the window. A
planner anywhere else would take both off the shelf. So this run asked whether
that is safe.

## The test

The second city is Chicago. The destinations are 359,603 Divvy bike-share trip
ends from April 2024 within 10 km of State and Madison. Lake Michigan cuts that
disc in half, and destinations sit farther out (median 3.3 km from the hub,
against 2.4 km in New York). Divvy ends fall on only 795 distinct points
(stations, or 0.01-degree cells for dockless e-bikes), so each one is spread
over a 200 m disc around its station or over its rounding cell. That 200 m is
a choice, and the
[extraction script](../../research/aerolog-scaling/experiments/hub_airspace/chicago_extract.py)
says so.

The run built 24 layouts (192 offset draws) with the same generator and
pipeline, and kept New York's budget frozen. Eight predictions and the reading
were pushed before any layout was built
([`chicago_transfer.py`](../../research/aerolog-scaling/experiments/hub_airspace/chicago_transfer.py)).

## What held

- **The p90 transfers.** S6 lands within **0.4% to 1.4%** of the full search at
  the 90th percentile in every cell (12 and 16 operators, measured and doubled
  offset). The five-spacing search does almost as well (0.5% to 1.4%).
- **The budget is close enough.** Chicago's own best budget, fitted in sample
  as a best case, is 0.060, 2.2 times New York's. Using New York's instead costs
  the three-spacing rule 0.18% in mean cost.
- **The tail is on the same side.** In 10 of 11 draws where the three-spacing
  rule misses by more than 5%, the best plan has more bands than the budget's,
  as it did in New York.

Six of eight predictions held.

## What broke

One draw costs **1.29 times** the full search. Its leak curve is not monotone:
0.18 at 4 bands, 0.029 at 5, 0.024 at 6. "Most bands within budget" jumps over
the leaky 4 and picks 6. The best plan has 3 bands, three below, which is just
outside S6's window. New York met the same shape once before, two below, and
that is what made the window lopsided in the first place.

The other refuted prediction is about the yardstick, not the rule. At 16
operators and the measured offset, S6's median is 1.0014. The 600-descent
oracle's median is the same, so it is the 50-start search itself that falls
0.1% short of the 1,600-descent plan there.

## A fix, not yet tested

After reading that draw, the run tried a *first-crossing* budget: stop at the
first band count whose leak is over budget. Across all 1,152 draws in both
cities it gives the same cost on 1,151 and is never worse. On the bent draw it
goes from 1.29 to 1.00, and Chicago's worst draw falls to 1.020
([post hoc results](../../research/aerolog-scaling/experiments/hub_airspace/chicago_transfer_posthoc_results.txt)).
This rule was chosen after seeing the failure, so it is a candidate, not a
result. The next step is to pre-register it on fresh layouts in both cities.

## Limits

This is one month of one bike-share system standing in for delivery addresses.
The station spread is a choice. There are 24 layouts, so a cell's p90 is about
its fifth-worst draw. The model is the same one as before (one Gaussian pair
error, offsets known exactly, five measured flights). Preliminary.

Numbers: [`chicago_transfer_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/chicago_transfer_results.txt).
Log entry: [`LOG.md`](../../research/aerolog-scaling/LOG.md).
