---
title: "A solar boat's sun correction is safe everywhere after three seasons, if it fits a cosine"
seo_title: "Solar USV seasonal correction: three seasons with a cosine"
date: 2026-11-16
tags: [research, marine-hull]
description: "Scoring six learned sun corrections on every 3-, 4- and 5-year log: a fitted yearly cosine is safe in every draw a season before raw month ratios."
---

Earlier today we put sixteen steps of the [marine-hull programme](../../research/marine-hull/) into [one design table](2026-11-16-marine-hull-solar-boat-how-many-seasons.md). The table answers one question: how many seasons of its own energy log a solar survey boat needs before it can safely correct its sun climatology. The answer then was "four seasons of raw month-by-month ratios". That answer had a gap. The smoother rules, which fit a yearly cosine to the log and sometimes pool it with other boats at the same latitude, had only been scored over every choice of learning years for one and two seasons.

So we ran them on every set of three, four and five learning years: six rules and sixteen sets of years, 40 minutes on four cores. Ten predictions were [committed before the run](../../research/marine-hull/experiments/run_many_year_rules.py), and all ten held. The results are in [`results_many_year_rules.txt`](../../research/marine-hull/experiments/results_many_year_rules.txt).

The scoring is the same as before. Each rule faces 168 test cases (30 ocean points, two five-year halves, four battery sizes, 21 climatology bias shapes). It wins a case when the boat goes at least as far as a plain 7-day trailing-mean rule with no more hours on a flat battery. With no correction the boat wins 139 cases over all 30 points. At the nine high-latitude points, where the climatology's seasonal error is largest, it wins 25.

| Seasons of log | Rule | All 30 points, mean [worst, best] | Nine high-latitude points |
|---|---|---|---|
| 3 | raw month ratios | 149.3 [123, 160] | 95.7 [50, 128] |
| 3 | fitted cosine, unshrunk | 156.5 [147, 164] | 83.0 [34, 112] |
| 3 | fitted cosine, pooled in latitude band | 155.5 [150, 161] | 56.7 [31, 86] |
| 4 | raw month ratios | 152.2 [143, 160] | 99.8 [81, 107] |
| 4 | fitted cosine, pooled in latitude band | 156.6 [153, 161] | 69.8 [59, 82] |

What changed:

- **A fitted cosine is safe in both places a season earlier.** With three seasons the pooled cosine and the unshrunk cosine never fall below "no correction" over any set of years, on all 30 points or at high latitude. The raw ratios still do once (123 of 168), so they need four seasons. With four seasons every rule we tried is safe on both counts.
- **The trade-off narrows but does not close.** On ordinary water the smoother rules beat the raw ratios by 6 to 7 cases at three and four seasons. At high latitude the raw ratios win more cases at every history length, including five seasons (105 against 73 for the pooled cosine).
- **One bad year still costs the most.** At three seasons, the sets that include the one bad learning year (2007 or 2012, depending on the half) score 20 to 34 high-latitude cases lower for every rule. Two other years now dilute it enough to stay above the floor, but only just: the worst draws are 31 and 34 against a floor of 25.

So the design rule in [section 2.7 of the paper draft](../../research/marine-hull/paper/DRAFT.md) is now: one season pooled on ordinary water; three seasons of a fitted cosine, or four of anything, to be safe everywhere.

The caveats have not changed. Five learning years give ten overlapping three-year sets and five four-year sets. The ranges are what we observed across those sets, not confidence intervals. The margin at high latitude is thin enough that another year of data or another sun dataset could move it. Everything is one simulated boat with one payload, and the sun data is NASA POWER only. The next step is to drive the harvest model with ERA5 at the nine high-latitude points, to see whether the raw ratios' lead there survives a second data source.

Written with AI assistance (Claude Code). Simulation only; nothing here has been tested on the water.
