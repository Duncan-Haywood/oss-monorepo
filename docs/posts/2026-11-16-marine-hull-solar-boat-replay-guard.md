---
title: "A solar boat replaying its own logged year can tell when a sun guard will hurt, not when it will help"
seo_title: "Solar USV sun correction: a replay gate fixes cost, not gain"
date: 2026-11-16
tags: [research, marine-hull]
description: "Gating a dark-summer guard on a replay of the boat's own learning year lifts the 30-point pool to 127 of 168 but keeps little of the high-latitude gain."
---

This is the next step in the [marine-hull programme](../../research/marine-hull/), on how a solar survey boat should correct its sun climatology from one season of its own energy log. Earlier today, [milestone 6zzp](../../research/marine-hull/LOG.md) tried a simple guard: never let the boat believe a summer darker than the climatology. At the nine high-latitude points it raised the five-year mean from 81 to 109 of 168 test cases, and it lifted the worst learning year from 1 to 74. Across all 30 points it did harm: the mean fell from 122 to 106. Every case it lost there was lost on hours spent with a flat battery. A brighter expected summer makes the boat bolder, and away from high latitude the boat was already bold enough.

That points to an obvious fix: apply the guard only where the boat is running short on distance. A deployed boat cannot see the years it will be scored on. It can replay the one year it logged, though. It runs the uncorrected plan and the 7-day baseline over that year's measured sun and checks whether the uncorrected plan fell short on km. We fixed that rule and ten predictions [in the script](../../research/marine-hull/experiments/run_side_guard.py) and committed them before the run. The run took 6 minutes on four cores. Results are in [`results_side_guard.txt`](../../research/marine-hull/experiments/results_side_guard.txt).

| Rule (one season of log) | All 30 points, mean [worst, best] | Nine high-latitude points |
|---|---|---|
| no correction | 139 | 25 |
| raw month ratios | 121.8 [97, 152] | 81.0 [1, 153] |
| dark-summer guard everywhere | 106.0 [69, 136] | 109.2 [74, 152] |
| guard where the replay is short on km | 127.2 [103, 154] | 85.8 [18, 152] |
| same, plus the mirror guard where the replay is dark-heavy | 131.6 [111, 156] | 85.8 [18, 152] |

Five of the ten predictions held. What we learned:

- **The replay is a good gate for the cost.** Where the guard hurt, the learning year usually replays as fine or as too heavy on dark hours. The gate then leaves the raw correction in place, and the 30-point mean rises past it, to 127.2 (131.6 with the mirror guard).
- **It is a poor gate for the gain.** At the high-latitude points, 80% of learning years replay as fine. The uncorrected plan does well on the year the boat logged, so the replay cannot say whether the summer learned from that year is too dark for the years ahead. The worst year recovers only to 18, against 74 for the guard everywhere.
- **The replay's side often differs from the side in the years the boat is scored on.** It matches in 65% of per-point cases.

The high-latitude failure is a forecast error about other years, and the one year in hand cannot reveal it. A guard there needs information from outside the boat's own log: a second irradiance source, a longer climatology, or other boats' logs. Pooling the fitted cosine across a latitude band (section 2.7 of the [paper draft](../../research/marine-hull/paper/DRAFT.md)) is the version of that already in the design table. The next step runs the harvest model on ERA5 at the nine high-latitude points.

Limits: one boat, one 50 W payload, the calm-water daily model and NASA POWER only. With five learning years, the brackets are observed ranges, not intervals.
