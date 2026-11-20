---
title: "Drone altitude layers: the leak tables were one shared kernel, and the grid was missing six bands"
seo_title: "Drone layer planner: 156x faster leak tables, one missing grid point"
date: 2026-11-20
tags: [research, uav, airspace, optimisation, numerics]
description: "One shared 1-D kernel builds the drone layer planner's leak tables 156 times faster with no plan changed, and shows its spacing grid skipped 6 bands."
---

`aerolog-scaling` plans how delivery-drone operators sharing a city are
stacked into altitude layers under the 400 ft (120 m) ceiling. Yesterday's
step (11at) found that the planner's search is cheap: 200 random restarts
take about 7 CPU seconds per city layout. Nearly all of the 252 seconds goes
into building the **leak tables**, which hold, for every pair of operators and
every pair of levels, how likely their drones are to come within 25 ft of
each other vertically.

Step 11au asked what those tables really cost. The predictions were committed
before the run.

## One kernel instead of 64

Each table entry averages a Gaussian overlap probability over 64 values of
the pair's height-keeping noise (taken from real PX4 flight logs) and over
120 samples of the pressure difference between the two operators' hubs. The
64 noise values are the same for every pair. So averaging over them gives the
same function of one variable every time. Compute it once on a 1 mm grid and
read it by interpolation, and the 64-fold repetition goes away.

| | direct (old) | shared kernel |
|---|---|---|
| largest difference in any table entry | reference | 3.7 × 10⁻⁸ |
| same plan from a 20-start search | reference | 384 of 384 draws |
| tables per layout, median CPU | 214.8 s | 1.39 s |

*48 New York layouts, 8 barometer-offset draws each, 30 spacings.*

That's a **156-fold** saving with no plan changed. The search is now the
larger cost, so the next saving was in spacings. The leak can only fall as
levels move apart, so for each number of bands only the widest spacing that
fits needs searching. That's 10 spacings instead of 30. It found the same best
plan in 379 of 384 draws. In all 5 exceptions the winning plan was cheaper at
the wider spacing, so the misses came from the random starts, not the rule.
Put together, a full offset-aware plan for a 16-operator city takes **under a
second** and lands within 0.3% of the 200-start search at the median.

Five of the seven predictions held. The two that failed said the tables would
end up cheaper than the search (they're about twice its cost) and that the
widest-spacing rule would match in at least 380 draws (it matched in 379).

## The grid was missing six bands

Checking the widest-spacing rule turned up a bug that predates this step. The
spacing grid used since milestone 11ah adds 120 m / (2k − 1) rounded to six
decimals, and for 6 and 11 bands the rounding lands a hair *above* the exact
value. That spacing then fits one band fewer, so **no spacing on the grid
ever had 6 bands**.

With cheap tables the gap took 72 CPU seconds to check across every layout
and draw. Six bands at 10.9 m is worse than the reported plan at the median
(2% to 7%). But it is **cheaper in 18 to 30 of 96 draws**, by up to 8.6%. The
headline recommendation, 5 bands at 13.3 m, stands. The per-draw band counts
reported in the last several steps are missing an option that wins about a
fifth to a third of the time. The next step reruns them on a corrected grid,
which now costs minutes instead of hours.

Everything here is preliminary: one city, one demand year, five flights'
worth of measured offsets and a conflict model without avoidance.

Code and numbers: [`fast_tables.py`](../../research/aerolog-scaling/experiments/hub_airspace/fast_tables.py),
[`fast_tables_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/fast_tables_results.txt),
[`fast_tables_posthoc_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/fast_tables_posthoc_results.txt),
and section 6.11 of the
[draft paper](../../research/aerolog-scaling/paper/airspace_layers.md).
