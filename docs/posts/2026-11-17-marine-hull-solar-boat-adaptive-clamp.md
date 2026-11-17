---
title: "A solar boat can choose how hard to trust its own sun log, from the log itself"
seo_title: "Solar USV sun correction: an adaptive clamp from its own log"
date: 2026-11-17
tags: [research, marine-hull]
description: "Letting a solar boat set the clamp on its learned sun correction from its own ratios cuts the worst-case loss from 23.8 to 13.8 cases of 168."
---

A solar survey boat plans its battery use from a sunlight climatology. After one season at sea it can correct that climatology month by month: logged harvest over planned harvest. The [last step](2026-11-17-marine-hull-solar-boat-clamp-sweep.md) found that how far to trust those learned ratios depends on the world. When the climatology and the real sun come from the same product, the boat should cap each ratio at about ±5%. When it plans on one product and sails under another, it should let them run to ±40%. No single cap was within 24 cases of 168 of the best in every setting.

A deployed boat can't know which world it is in. It does know its own ratios, though, and in the mismatched worlds they sit further from 1. So this step tested three rules that set the cap from the learning year itself, all written down with ten predictions before the run:

- **Proportional (AP):** cap at the ratios' own mean distance from 1, between ±2% and ±40%.
- **Switch (AS):** ±5% if that distance is under 10%, otherwise ±30%.
- **Level switch (AL):** the same switch, keyed on the annual level being off by 5%.

We scored them as before: all 30 ocean points with NASA POWER sunlight, and nine high-latitude points in four worlds (NASA throughout, ERA5 throughout, plan on NASA and sail on ERA5, and the reverse). The boat wins a case when it travels at least as far as a 7-day trailing-mean baseline with no more hours running dark.

What we found (eight of ten predictions held):

- **The proportional cap is the safest rule yet.** It is never more than 13.8 cases behind the best fixed cap in any of the five settings. The best fixed cap manages 23.8. On all 30 points it wins 147.8 cases, against 139 with no correction. In the plan-NASA, sail-ERA5 world it wins 52.8, against 22.2 for a fixed ±5%.
- **The switch is better in two settings but worse in a third.** It wins 150.2 on all 30 points and 57.4 in the mismatched world. When the plan is brighter than the sea, it falls 25 cases short. There the boat needs a moderately wide cap most years, and the switch gives it ±5% most years and ±30% in a few.
- **The signal is real.** The switch goes wide in 7% of learning years on ordinary water and in 57% when plan and sea come from different products.
- **Below ±5% the fixed curve is flat.** From ±2% to ±5% it wins 152.0 to 152.6 cases. A ±1% cap is the first rule in this line to beat no correction scored point by point on the real climatology (130.4 against 126 of 240). That makes it barely a correction at all, which fits the reading that the cap works as shrinkage.

For a designer: setting the cap to the learned ratios' own spread is a rule fixed in advance that costs about 5 cases on ordinary water and protects the boat when its climatology is wrong. That makes it a better default than any fixed width we have tried.

Limits: the fixed ±3% and ±1% figures are the best of eleven widths scored on the same years, so they are selections. The adaptive rules were fixed in advance but scored on the same ten years as every step since 6zzj. ERA5 stands in for the real sun. One learning year, one boat, a 50 W payload and a calm-water daily model.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_adaptive_clamp.py`, `experiments/results_adaptive_clamp.txt`).
