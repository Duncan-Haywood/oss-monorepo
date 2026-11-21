---
title: "Drone altitude layers: a leak budget of a few per cent beats the 3-sigma spacing rule"
seo_title: "Drone altitude layer spacing: leak budget vs the 3-sigma rule"
date: 2026-11-21
tags: [research, uav, airspace, optimisation]
description: "When each drone operator's barometer has its own offset, sizing altitude layers by a 3-sigma rule leaves a band unused. A few per cent leak budget works better."
---

`aerolog-scaling` plans how delivery-drone operators sharing a city are
stacked into altitude layers under the 400 ft (120 m) ceiling. Every
operator flies a different airframe, and each airframe's barometer reads a
few metres off at cruise speed. We measured those offsets on public PX4 flight
logs with RTK GNSS height: -4.7 to +1.6 m at 10 m/s.

The textbook way to space the layers is a 3-sigma rule. Make the gap between
levels clear the separation minimum by three standard deviations of the
height error between two drones. For a Gaussian error, that allows a 0.135%
chance that two drones one level apart lose separation. In our last step
(11aw) that rule put one band too few into the stack in every case we tried.
Its plans cost 18% to 47% more losses of separation than a full search.

## What we tried (11ax)

We kept the inputs a practitioner would have: the measured offsets, how often
each pair of operators' routes conflict, and an offset-blind plan with its
bands sorted by offset. The 3-sigma test was swapped for the quantity it
stands in for. At each band count we computed the conflict-weighted chance
that two drones one level apart overlap, and took the most bands whose chance
stays inside a budget. The budget was calibrated on the 12-operator city
layouts and tested unchanged on the 16-operator ones. The predictions were
committed before the run.

## What we found

| 16 operators (held out) | 3-sigma rule | budget 0.07 |
|---|---|---|
| matches the search's band count, measured offset | 8 of 96 | 40 of 96 |
| matches it, twice the offset | 2 of 96 | 47 of 96 |
| 50-restart plan at the rule's one spacing, cost vs full search, measured offset | 1.11 | 1.014 |
| the same, twice the offset | 1.33 | 1.010 |

The budget that fits best is **0.07 per adjacent pair, about 50 times the
3-sigma tail**. The planner's job is to trade conflicts between neighbouring
levels against conflicts inside one level. At the optimum it accepts a
few per cent leak, so a safety-style tail probability is the wrong budget for
choosing the spacing.

The rule picks the spacing well. Fix the spacing it gives, run 50 restarts
of the band search there instead of across all 32 spacings, and the plan is
within about 1.4% of the full search.

It picks the band count less well, and we say so. Two of our five
predictions failed. The held-out match at the measured offset was 40 of 96
draws, not the half we predicted. The search's own plans for 12 operators
accepted a median leak of 0.0096, just under the 0.01 we predicted. Part of
the reason is that the search itself is split: at twice the offset it picks
3 bands in about half the draws and 5 or 6 in most of the rest. No budget we
tried matched more than 54 of 96 draws.

## Caveats

These results come from one city (New York), from offsets measured on 5
flights chosen by their uploaders, and from a single calibration split. They
are preliminary. The next step is to calibrate the budget on conflict cost
itself, with cross-validation over layouts.

Code and full results: `research/aerolog-scaling/experiments/hub_airspace/leak_budget.py`
and `leak_budget_results.txt`. The paper draft's Section 6.14 has the details.
