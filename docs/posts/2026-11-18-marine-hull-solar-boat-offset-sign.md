---
title: "Forcing the solar boat's sun forecast darker or brighter: a cautious boat loses more than a bold one"
seo_title: "Solar USV sun correction: does a dark or bright bias matter more?"
date: 2026-11-18
tags: [research, marine-hull]
description: "Shifting the learned sunlight ratios by -3% to +3% at nine high-latitude points: every clamp gains brighter, loses darker; an old reading is withdrawn."
---

The [marine-hull programme](../../research/marine-hull/README.md) has a solar survey boat that plans its days from a sunlight climatology, corrected by month-by-month ratios it learns from its own log and clamps to a narrow band. [The last step](2026-11-18-marine-hull-solar-boat-high-latitude-clamp.md) found that at nine high-latitude points the ±2% clamp only ties no correction and the ±10% clamp loses. It also offered an explanation, after the fact, for why ±10% had *won* at the same nine points in an earlier design: there the boat's learning years were darker than the climatology, and here they were brighter. The idea was that a dark expectation makes the boat cautious, which costs little at points where it is mostly parked, while a bright one makes it bold and runs its battery flat in the dark.

**The test.** That explanation can be checked directly. We kept everything fixed (the 2005 to 2014 climatology, the scored years 2020 to 2025, three seasons of log, the same nine points) and multiplied every learned month ratio by 1 + d before the clamp, for d from -3% to +3%. A narrow clamp cuts most of the shift; a wide one passes it through. If the explanation were right, darkening would help the ±10% clamp and brightening would hurt it. We committed nine predictions to the script before the full run, and the run reproduced the previous step's numbers exactly at d = 0.

Six-year mean, out of 84 cases (four battery sizes times 21 power-demand shapes, distance and dark hours summed over the nine points) where a rule must match a simple 7-day baseline on distance without more dark hours. No correction scores 48.5.

| clamp | d = -3% | -1.5% | 0 | +1.5% | +3% |
|---|---|---|---|---|---|
| ±2% | 45.5 | 47.2 | 48.5 | 49.4 | 50.5 |
| ±5% | 37.1 | 41.6 | 44.1 | 45.9 | 47.8 |
| ±10% | 25.4 | 32.7 | 36.6 | 38.5 | 41.9 |

**It goes the other way.** Every clamp gains as the forecast gets brighter and loses as it gets darker, and the wide clamp moves most: ±10% loses 20 cases to ±2% when the offset is forced dark, and 8.6 when it is forced bright. Six of the nine predictions failed, all of them the ones about direction. The three that held describe why: at these points 88% to 100% of the failures are on distance alone. A boat that expects less sun holds back and falls short of the baseline's kilometres; the dark-hour cost of boldness does show up at +3% but stays under 12% of failures.

**What this changes.** The explanation from the last step is withdrawn: a dark offset passed through a wide clamp is the worst case here, so it cannot be why the wide clamp won in the earlier design. That win is unexplained again; the next step forces the same shift in that design to see whether it is about how accurate the offset is or about the scored decade. The advice for a designer stays the same, clamp the learned ratios to ±2% and never wide at high latitude, with one addition: at mostly parked high-latitude points the correction's costly mistake is caution. A +3% bias on the ±2% clamp scored best (+2.0 over no correction), but it was picked on these same years and beat no correction in only three of six, so it is not a rule.

Limits: one design and one history length; the shift is uniform across months; the six years share learning seasons; one boat with a 50 W payload on a calm-water daily model; NASA POWER sunlight only; 20 of the 21 power shapes are synthetic.

Results: [`results_offset_sign.txt`](../../research/marine-hull/experiments/results_offset_sign.txt); code: [`run_offset_sign.py`](../../research/marine-hull/experiments/run_offset_sign.py).
