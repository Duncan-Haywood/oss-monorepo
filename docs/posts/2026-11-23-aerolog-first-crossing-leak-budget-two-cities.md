---
title: "Drone altitude layers: read the leak budget as a first crossing, and the rare 17% miss goes away"
seo_title: "Drone altitude layer planner: first-crossing leak budget test"
date: 2026-11-23
tags: [research, uav, airspace, optimisation]
description: "On 48 fresh layouts in New York and Chicago, stopping at the first over-budget band count fixes 3 misses of 8-17% and is never worse. 8 of 8 predictions held."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) is working out how far
apart delivery-drone altitude layers should be when each operator's airframe
carries its own barometric offset. The planner averages, for each candidate
number of layers, the chance that two drones one level apart lose vertical
separation (the *leak*). It then searches a short window of layer counts
around the most layers whose leak stays under a budget of 0.027.

The [previous run](2026-11-23-aerolog-leak-budget-second-city-chicago.md)
took that rule to Chicago and found one draw where it cost 29% more conflict
than the full search. The leak curve there was not monotone: 0.18 at 4
layers, 0.024 at 6. "Most layers under budget" jumped over the leaky 4 and
landed at 6, three counts above the best plan. After seeing that draw, the run
proposed a fix: read the budget as a *first crossing*, stopping at the first
layer count whose leak is over budget. That fix was post hoc. This run tested
it.

## The test

48 new layouts were drawn: 24 on New York destinations and 24 on Chicago ones,
384 offset draws in all, with the budget frozen. Eight predictions, and what
each outcome would mean for the builder rule, were pushed before any layout
was built
([`first_crossing.py`](../../research/aerolog-scaling/experiments/hub_airspace/first_crossing.py)).
The key one was not automatic. The first-crossing count is never above the
old one, so its window can lose the top layer counts, which is where the
planner's misses usually sit. "Never worse" could have failed.

## What happened

All eight held.

- **The two readings disagree rarely:** on 8 of 384 draws (2 in New York, 6
  in Chicago), always where the leak dips between layer counts.
- **The first-crossing search is worse on none.** It is better on 3, where the
  old rule misses by **17%, 8% and 15%** and the new one finds the full
  search's plan. Each time the old rule picked 6 layers and the best plan had 3.
- **Its worst draw is 2.9%** of the full search's cost, against 17% for the
  old rule. In every one of the eight city × fleet × offset cells, its median,
  90th percentile, mean and worst draw equal a 600-descent search over every
  layer count. It gets there with 300 descents.
- Over every data set the programme has scored (1,536 draws, two cities), the
  first-crossing reading is worse on none and better on 4.

So the builder rule changes: take the most layers such that *every* count up
to it leaks within budget, then search two counts below and three above.
Paper section 6.9, the discussion and the abstract now say so.

## Limits

These are synthetic hub layouts on real destination data: 2014 ride-hail
pickups in New York, and one month of Divvy bike-share ends in Chicago spread
by 200 m. The model uses one Gaussian pair error, with offsets known exactly.
There are 24 layouts per city, so a dip that bites on about 1 draw in 100 is
measured from a handful of cases. Preliminary.

Numbers: [`first_crossing_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/first_crossing_results.txt).
Log entry: [`LOG.md`](../../research/aerolog-scaling/LOG.md).
