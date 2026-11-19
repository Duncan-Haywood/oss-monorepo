---
title: "A greedy rule for drone altitude layers: when one pass is enough and when it is not"
seo_title: "Drone altitude layers: greedy rule vs full search"
date: 2026-11-19
tags: [research, uav, airspace, barometer, planning]
description: "Inserting drone operators into altitude bands in barometer-offset order costs 12% to 14% more than the full search at measured offsets, but wins at twice them."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m (400 ft) column. Each airframe's
barometer carries a **speed offset**, a static-pressure error that cancels
between one operator's drones but not between two operators. The layer planner
handles it with a full search: 200 local descents from random starts at each
of 30 candidate spacings.

Earlier today step 11ar tried a cheap shortcut: take the plan made without
offsets and re-order its bands by offset. It made things worse. Its reading was
that the search wins by moving *single operators*, not whole bands. Step 11as
tests the obvious rule that does that:

1. sort the operators by measured offset;
2. place them one at a time, each into the band that is cheapest given the
   operators already placed (the same conflict and climb costs the planner
   uses);
3. optionally, run one local repair pass.

Predictions were committed before the run. The same 48 layouts, 4 offset draws
and scoring as 11aq and 11ar were used, and every score of the full search
reproduces exactly.

## What happened

| median cost vs full search | 12 operators | 16 operators |
|---|---|---|
| **measured offset** | | |
| plan that ignores offsets | 1.034 | 1.018 |
| bands sorted by offset (11ar) | 1.100 | 1.128 |
| greedy insertion in offset order | **1.123** | **1.140** |
| greedy, then one repair pass | 1.064 | 1.071 |
| **twice the measured offset** | | |
| plan that ignores offsets | 1.163 | 1.130 |
| bands sorted, then one repair pass (11ar) | 1.052 | 1.061 |
| greedy insertion in offset order | 1.099 | 1.105 |
| greedy, then one repair pass | **1.041** | **1.053** |

*Medians over 96 layout-draws, each with the best of 30 spacings; cost is the
planner's expected conflict-and-climb score, so 1.12 means 12% worse than the
full search.*

At the offset measured on real flights, the greedy rule loses. It is worse than
simply ignoring the offsets, and beats that plan in only 17 and 7 of 96 draws.
A single pass cannot reproduce what 200 restarts find in the conflict
structure, and at this offset size the conflict structure matters more than
the offsets.

At twice the offset, a rough stand-in for delivery cruise speeds that have not
been measured yet, the picture flips. Greedy insertion followed by one repair
pass is the best cheap rule tested so far. It recovers 60% to 75% of the gap
between the offset-blind plan and the full search, and beats the blind plan in
75 and 68 of 96 draws. The order matters: inserting by offset gives plans about
4% cheaper than inserting the most-conflicted operators first, the textbook
graph-colouring order. All three greedy passes over all 30 spacings take 0.16
CPU seconds per layout.

Four of the five predictions held. The refuted one said the greedy rule would
beat 11ar's band sort at both offset sizes. It does only at twice the offset.

## What it means

For the airspace paper (draft section 6.9): at measured offsets, keep the full
search and feed it the measured offsets. Greedy insertion plus one repair pass
is a reasonable fallback only when offsets are large. The next step is to
measure how many restarts the measured-offset case actually needs, by giving
the greedy a handful of perturbed starts.

Limits: one city, one demand year, five measured flights, offsets assumed known
exactly, a conflict model without avoidance, and a greedy rule that still needs
the planner's cost tables. All results are preliminary.

Code and results: `research/aerolog-scaling/experiments/hub_airspace/greedy_rule.py`
and `greedy_rule_results.txt`.
