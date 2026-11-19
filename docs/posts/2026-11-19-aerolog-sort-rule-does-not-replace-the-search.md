---
title: "Sorting a drone layer plan by barometer offset makes it worse: a cheap rule against the full search"
seo_title: "Drone altitude layers: a sort-by-offset rule fails"
date: 2026-11-19
tags: [research, uav, airspace, barometer, planning]
description: "Re-ordering an offset-blind drone layer plan by barometer offset cost 10% to 13% more than the full search, worse than not sorting at all."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m (400 ft) column. The problem
today is the **barometer speed offset**: a static-pressure error set by the
airframe. It cancels between two drones of one operator and does not cancel
between two operators.

Earlier today, step 11aq showed what the layer planner does about it. When the
planner knows each operator's offset, it puts operators with similar offsets
next to each other. The offset difference between neighbouring levels drops to
0.70 of what a random assignment gives. That suggested a shortcut a
practitioner could use without re-running the planner:

1. take the plan made without offsets;
2. re-order its bands so the mean offset rises (or falls) up the stack;
3. space the bands with the 3-sigma rule, applied only to the operators that
   end up one level apart.

Step 11ar tested that shortcut on the same 48 layouts and 4 offset draws as
11aq. The predictions were committed before the run, and the reproduction
checks passed: the blind plans and every score of the aware plans match 11aq
exactly.

## What happened

| | 12 operators | 16 operators |
|---|---|---|
| blind plan (offsets ignored), cost vs full search | 1.034 | 1.018 |
| blind plan with bands sorted by offset | **1.100** | **1.128** |
| sorted, then one local repair pass | 1.063 | 1.072 |
| bands from the 3-sigma rule on adjacent pairs (search: 5) | 4 | 4 |

*At the measured offset (s = 1); medians over 96 layout-draws; cost is the
planner's expected conflict-and-climb score, so 1.10 means 10% worse than the
full search.*

Sorting the bands made the plan **worse than not sorting**. The sorted plan
beat the plain blind plan in only 19 and 12 of 96 draws. The blind plan's band
order is not arbitrary: it is already fitted to which operators conflict and
to how far each one has to climb. Moving a whole band to line up offsets
breaks that order. The full search gets its gain another way: it moves single
operators and keeps the order that matters.

At twice the measured offset the picture changes. Sorting alone still gains
almost nothing (1.162 and 1.173 against the blind plan's 1.163 and 1.130).
Sorting followed by one local repair pass gets to 1.052 and 1.061, though, and
beats the blind plan in 76 and 65 of 96 draws. So "sort, then repair" is a
usable cheap planner when offsets are large, but not at the size measured in
real flights.

The spacing rule did a little better than before. Applied to the adjacent
pairs, it asks for 4 bands where the fleet-wide version asked for 3. The search
still keeps 5. After sorting, the offset spread between neighbours (2.5 to
2.9 m) is still above the 1.9 m that five bands 13.3 m apart allow.

Two of the five predictions held. The three refuted ones are the ones a
practitioner would have relied on.

## What it means for the paper

The draft's advice changes from "sort operators by offset" to **re-run the
assignment with the measured offsets**. Patching an offset-blind plan does not
work, and the 3-sigma rule stays a conservative bound rather than the optimum.
Section 6.8 and row Q9 of the airspace paper draft now say this, and every
number in them is checked against the results file.

Limits: one city, one demand year, five measured flights, offsets assumed
known exactly, and a conflict model without avoidance. The test covered one
natural cheap rule, not every possible one. An operator-by-operator greedy
insertion is the next one to try. All results are preliminary.

Code and results: `research/aerolog-scaling/experiments/hub_airspace/sort_rule.py`,
`sort_rule_results.txt` and `sort_rule_posthoc_results.txt`.
