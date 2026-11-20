---
title: "Drone altitude layers: the offset-aware search needs about 10 random starts, not 200"
seo_title: "Drone layer planning: 10 random restarts are enough"
date: 2026-11-20
tags: [research, uav, airspace, barometer, optimisation]
description: "Ten to twenty random restarts bring the drone altitude-layer search within 1% of 200, greedy starts are no better, and the search is 3% of the CPU."
---

`aerolog-scaling` plans how delivery-drone operators sharing a city are
stacked into altitude layers under the 400 ft (120 m) ceiling. The last few
steps dealt with the **barometer speed offset**: an altitude error that one
operator's drones share but two operators' drones do not. A planner that
knows each operator's offset puts operators with similar offsets next to
each other (step 11aq).

Two cheap shortcuts did not work at the measured offset. Sorting the bands of
a plan made without the offsets made things worse (11ar). So did a single
greedy pass that inserts operators in offset order (11as). Yesterday's
conclusion was that the full search's value lies in its **restarts**: 200
random starting plans per spacing, each improved by local moves. But nobody
had measured how many of those restarts it actually needs.

Step 11at measured it on the same 48 city layouts and 4 offset draws, with the
predictions committed before the run.

## What happened

| starts per spacing | random, 12 operators | random, 16 operators | greedy, 12 | greedy, 16 |
|---|---|---|---|---|
| 1 | 1.040 | 1.049 | 1.077 | 1.075 |
| 5 | 1.010 | 1.019 | 1.015 | 1.017 |
| 10 | 1.005 | 1.009 | 1.006 | 1.007 |
| 20 | 1.0004 | 1.0035 | 1.003 | 1.004 |
| 50 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

*At the measured offset; median cost (losses of separation) relative to the
200-start search, best spacing for each row. The plan that ignores the
offsets scores 1.034 and 1.018.*

- **Ten random starts get within 1%** of the 200-start search, and twenty
  within 0.4%. At twice the offset, ten are within 0.1%.
- **Greedy starts don't help.** Starts built from the offset-ordered
  insertion are worse than random ones as single starts, and they won only 2
  of the 12 pre-registered comparisons.
- **The search was never the expensive part.** All 200 starts, over 30
  spacings and 8 offset draws, take a median 7.4 CPU seconds per layout. The
  whole analysis takes 252 seconds, and nearly all of that goes into building
  the per-pair tables of how likely two levels are to leak into each other.

Three of the five predictions held. The two that failed said greedy starts
would beat random ones and that ten random starts would not be enough.

## What it changes

Two earlier steps went looking for a cheap rule to replace the search, and
this step shows the search costs almost nothing. If you can build the leak
tables, run the search, even with a dozen starts. A shortcut is only worth
having when the tables can't be built, for example when the offsets aren't
known per operator. The next step prices the tables themselves: coarser
supports, fewer spacings, or reusing tables across offset draws.

Everything is preliminary: one city, one demand year, five flights' worth of
measured offsets, and a conflict model without avoidance.

Code and numbers: [`few_start.py`](../../research/aerolog-scaling/experiments/hub_airspace/few_start.py),
[`few_start_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/few_start_results.txt),
and section 6.10 of the
[draft paper](../../research/aerolog-scaling/paper/airspace_layers.md).
