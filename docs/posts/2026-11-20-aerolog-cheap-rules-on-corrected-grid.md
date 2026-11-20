---
title: "Drone altitude layers: one restart that knows the barometer offsets beats a plan that ignores them"
seo_title: "Drone layer planning: cheap rules rerun on a fixed grid"
date: 2026-11-20
tags: [research, uav, airspace, barometer, optimisation]
description: "Rerun on a spacing grid with every band count, cheap drone-layer rules barely move, but one descended random start now beats the offset-blind plan."
---

`aerolog-scaling` plans how delivery-drone operators sharing a city are
stacked into altitude layers under the 400 ft (120 m) ceiling. Each operator's
drones carry a **barometer speed offset**: an altitude error the operator's
own drones share but two operators' drones do not. Earlier steps tested cheap
rules that might replace the full offset-aware search: sort the bands of a
plan made without the offsets (11ar), insert operators greedily in offset
order (11as), or run only a few random restarts (11at).

Then step 11au found a bug in the spacing grid all of those used. Rounding
meant no spacing on the grid gave 6 bands, and 11av showed 6 bands is the
better choice in 14 to 31 of every 96 cases. The fix made the plan that
ignores the offsets look worse than reported. So the cheap-rule comparisons
were measured against the wrong reference. This step reruns them on the
corrected grid.

## What we found

The predictions were committed before anything ran. Four of five held.

- **The rules barely move.** Every rule's median cost relative to the
  offset-aware plan changed by at most 0.01. Sorting bands still costs about
  1.09 to 1.12 times the aware plan at the measured offset. Greedy insertion
  still costs 1.12 to 1.15. Both remain worse than ignoring the offsets.
- **At twice the offset, greedy insertion plus one local repair is still the
  best cheap rule**: 1.04 and 1.05 times the aware plan. It beats the blind
  plan in 88 and 76 of 96 cases.
- **New: one random start beats the blind plan everywhere.** Start from one
  random plan, apply local moves with the offsets known, and you beat a plan
  made without them in every setting. At the measured offset it costs 1.035
  against 1.044 and 1.047 against 1.065. On the old grid it lost at 12
  operators.
- **The refuted prediction:** 20 random starts per spacing were supposed to
  get within 0.5% of the full search everywhere. At 16 operators they reach
  only 0.55%. Fifty starts close the gap.
- **The 3-sigma spacing rule never picks 6 bands**, now that it could. After
  sorting, the offset difference between neighbouring operators is still
  2.3 to 2.6 m, and 6 bands would need about 1.1 m.

## What it changes

None of the earlier conclusions flip. One gets sharper. If you know each
operator's offset, almost any search that uses it beats a plan that doesn't,
down to a single random restart. The safe default is 50 restarts per spacing,
which takes under a second per city with the fast tables from 11au. The paper's
caveat that sections 6.8 to 6.10 sat on the broken grid is now closed (new
section 6.13).

Everything is preliminary: one city, one demand year, five flights' worth of
measured offsets, and a conflict model without avoidance.

Code and numbers: [`exact_rules.py`](../../research/aerolog-scaling/experiments/hub_airspace/exact_rules.py),
[`exact_rules_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/exact_rules_results.txt),
and section 6.13 of the
[draft paper](../../research/aerolog-scaling/paper/airspace_layers.md).
