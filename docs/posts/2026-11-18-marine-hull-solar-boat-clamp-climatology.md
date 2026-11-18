---
title: "The solar boat's best sun-correction clamp is ±2% whether its climatology is current or a decade old"
seo_title: "Solar USV sun correction: does the clamp depend on the climatology?"
date: 2026-11-18
tags: [research, marine-hull]
description: "Rescoring clamps from ±1% to ±10% under a current climatology: ±2% stays best and beats no correction in all 11 years, while wide clamps lose their edge."
---

The [marine-hull programme](../../research/marine-hull/README.md) has a solar survey boat that plans its days from a sunlight climatology. It corrects that climatology with month-by-month ratios learned from its own log, clamped to a narrow band. [The last step](2026-11-18-marine-hull-solar-boat-clamp-plateau.md) found that clamps from ±2% to ±4% form a plateau. There was a catch. In that test the climatology was a decade older than the years the boat learned from, so the learned ratios carried a decade-level offset of 0.5 to 1.8%, and a wider clamp lets more of that offset through. Was the plateau a property of the noise in the month ratios, or of the stale climatology?

**The test.** We rescored the same fixed clamps (±1, 2, 3, 4, 5, 7 and 10%) under a current climatology, built from 2015 to 2024 and leaving out the scored year. We scored 2020 to 2025, the same years as last time, so each year pairs with its earlier row and only the climatology differs. We also scored 2010 to 2014, where the learning years fall outside the climatology. We committed ten predictions before the full run, and nine held. The run reproduced the earlier step's numbers for no correction and ±3% exactly, in every year checked.

**±2% stays best.** Here is the mean with three seasons of log, out of 84 cases (30 ocean points, four battery sizes, 21 power-demand shapes). A case counts as a win when a rule matches a simple 7-day baseline on distance without spending more hours with the payload dark:

| clamp | none | ±1% | ±2% | ±3% | ±4% | ±5% | ±7% | ±10% |
|---|---|---|---|---|---|---|---|---|
| 2020–2025, current climatology | 59.5 | 64.3 | **66.6** | 66.1 | 63.8 | 62.2 | 58.7 | 56.9 |
| 2010–2014, current climatology | 71.6 | 79.7 | **80.5** | 79.0 | 77.3 | 75.9 | 73.8 | 71.9 |
| years above no correction (of 11) | | 11 | **11** | **11** | 8 | 6 | 5 | 4 |

±2% is the best width in both groups of years, with one, three and five seasons of log (at five seasons on 2010 to 2014 it ties with ±1%). ±2% and ±3% beat no correction in all eleven years, with a worst margin of +0.9 cases each. Taken together with the last step's six years under the old climatology, that makes 17 scored-year rows out of 17.

**What moved was the wide shoulder.** Pairing each year from 2020 to 2025 under the two climatologies, the mean gain over no correction is:

| clamp | ±1% | ±2% | ±3% | ±4% | ±5% | ±7% | ±10% |
|---|---|---|---|---|---|---|---|
| decade-old climatology | +3.7 | +6.9 | +7.1 | +6.3 | +5.1 | +2.2 | +0.3 |
| current climatology | +4.8 | +7.1 | +6.6 | +4.3 | +2.7 | -0.8 | -2.6 |

The narrow clamps gain about seven cases whichever climatology the boat starts from. The wide clamps lose two to three cases each once there is no offset to learn. Their extra width had been buying back the climatology's drift, and a ±2% clamp already captures most of that.

**One prediction failed.** We expected ±1% to sit on the plateau with ±2% and ±3%. It sits 2.3 cases below. The prediction that the best gain would be smaller than last time held only at the precision of the printed counts (+7.07 against +7.10), so read it as a tie.

**What it does not say.** Scored per point on the real hull, no width beats planning on the plain climatology (75.5 of 120 at best, against 77.3); the gain appears when points are pooled. The 2010 to 2014 years are among those ±3% was originally chosen on. The eleven years share learning seasons, so they are not independent draws. Everything is one boat with a 50 W payload, a calm-water daily model and NASA POWER sunlight. For a designer, the rule no longer depends on how old the climatology is: clamp the learned month ratios to ±2%, and don't widen the clamp to allow for an old climatology. Results are in [`results_width_new_clim.txt`](../../research/marine-hull/experiments/results_width_new_clim.txt).
