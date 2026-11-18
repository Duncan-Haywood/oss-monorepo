---
title: "The solar boat's ±3% sun-correction clamp is a plateau, not a lucky pick, and ±2% is the safer end"
seo_title: "Solar USV sun correction: how wide should the clamp be?"
date: 2026-11-18
tags: [research, marine-hull]
description: "Fixed clamps from ±1% to ±10% scored on six years no width was tuned on: ±2% to ±4% form a plateau, and only ±2% and ±3% beat no correction every year."
---

The [marine-hull programme](../../research/marine-hull/README.md) has a solar survey boat that plans its days from a sunlight climatology. It corrects that climatology using month-by-month ratios learned from its own log, clamped to a narrow band. [The last step](2026-11-18-marine-hull-solar-boat-stale-climatology.md) found that only one correction rule stayed ahead of no correction in every year scored: the ratios clamped to ±3%. The open question was where ±3% came from. It was the best of eleven fixed widths on the same years the rules were developed on. So was it a real optimum, or a lucky pick?

**The test.** We swept fixed clamps of ±1, 2, 3, 4, 5, 7 and 10% over 2020 to 2025. The boat learned from the seasons just before each year, and the climatology was built from 2005 to 2014. None of those years was used to choose a width. We committed ten predictions to the script before the full run. Eight held. The run also reproduced the last step's numbers exactly: no correction in every year, and ±3% in 2025.

**A plateau.** Here is the six-year mean, with three seasons of log, out of 84 cases (30 ocean points, four battery sizes, 21 power-demand shapes) where a rule must match a simple 7-day baseline on distance without more dark hours:

| clamp | none | ±1% | ±2% | ±3% | ±4% | ±5% | ±7% | ±10% |
|---|---|---|---|---|---|---|---|---|
| six-year mean | 56.0 | 59.7 | 62.9 | **63.1** | 62.3 | 61.1 | 58.2 | 56.2 |
| years above no correction | | 6 of 6 | **6 of 6** | **6 of 6** | 5 of 6 | 3 of 6 | 2 of 6 | 3 of 6 |
| worst year vs no correction | | +1.0 | **+4.0** | +1.5 | -1.3 | -3.3 | -8.3 | -12.6 |

From ±2% to ±4% the curve is flat to within one case, and ±3% is its highest point by a hair. So ±3% was not a lucky pick. But the best width in any one year wanders: ±2% in 2022 and 2025, ±5% and wider in 2021 and 2023. In those two years the wide clamps gain about 20 cases. In 2025 they lose up to 12.6.

**The safe end is the narrow one.** ±2% and ±3% beat no correction in all six years. ±2% has the bigger worst-year margin (+4.0 against +1.5). That comparison came after the run, and ±2% was not among the rules the last step's "only ±3%" finding was drawn from. A ±2% clamp is binding on about two-thirds of the learned month ratios, so the boat takes most of its seasonal signal as a small, capped nudge.

**Two predictions failed.** We expected more log to justify a wider clamp. It did not: with five seasons the best width is ±2% (tied with ±3%), and with one season it is ±3%. We also expected ±3% to be within two cases of each year's best width in at least four of the six years. It managed three.

**What it does not say.** Scored per point on the real hull, no width beats planning on the plain climatology (75.5 of 120 at best, against 76.7). The gain shows up when points are pooled, where it is carried by the high-distance points. The six years share learning years, so they are not six independent draws. Everything is one boat with a 50 W payload, a calm-water daily model and NASA POWER sunlight. For a designer the advice gets one notch more specific: clamp the learned month ratios to ±2% to ±3%, and do not open the clamp. Results are in [`results_width_oos.txt`](../../research/marine-hull/experiments/results_width_oos.txt).
