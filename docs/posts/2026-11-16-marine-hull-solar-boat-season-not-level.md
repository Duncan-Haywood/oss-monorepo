---
title: "A solar boat's learned sun correction fixes the season, not the level: we were wrong last time"
seo_title: "Solar USV sun correction: season shape, not level offset"
date: 2026-11-16
tags: [research, marine-hull]
description: "Splitting a solar boat's learned correction into an annual level and a seasonal shape: the shape carries the whole gain, which overturns our previous reading."
---

A solar survey boat plans its battery use from a sunlight climatology. If it keeps a log, one season of month-by-month ratios (logged harvest over planned harvest) can correct that climatology. In the [previous step](2026-11-16-marine-hull-solar-boat-plan-nasa-sail-era5.md) the boat planned with NASA POWER's climatology but sailed under ERA5 sunlight, which runs 2% to 22% brighter at the nine high-latitude points we test. The learned correction's lead over no correction grew, from 28 to 42 of 168 test cases. We read that as a level correction: the boat learns that the sea is brighter than its plan. We did not test it.

This step did. We split each learned correction into two parts: one annual level (total logged over total planned), and the monthly ratios with that level divided out (the seasonal shape). Then we ran the boat on each part alone. We wrote ten predictions down first. Five held, and the two about the level failed badly.

- **The level alone is worth almost nothing.** Planning on NASA and sailing on ERA5, the learned annual level beats the 7-day baseline in 5 of 168 cases. No correction gets 3. With NASA used throughout it does worse than no correction (21.8 against 25).
- **The seasonal shape is worth all of it.** The month ratios with their level removed score 45.4, against 45.2 for the full correction.
- **Why:** the boat's adaptive rule already tracks a 90-day running ratio of logged to planned sun, so it learns a level offset within weeks. What it cannot learn in time is an error that changes with the season, and ERA5's excess over NASA at these points does change with the season. One logged year supplies that shape.
- **The clamp was holding the correction back.** We cap each learned month ratio at ±15%. A quarter of them hit the upper cap in the mismatched case. Widening the cap to ±30% lifts the score from 45.2 to 61.6, and moves the two cases where plan and sea match by under 3.
- **The reverse mismatch is no harder.** Planning on ERA5 and sailing on NASA (a plan brighter than the sea), the learned correction scores 83.8 against no correction's 18. We expected the boat to fail by running its battery flat in the dark. It didn't: every one of its 150 losses was on distance. The baseline plans on the same bright climatology, so the two make the same bold mistake, and the difference is how fast each backs off.

For a designer: if you correct a sun climatology from your own log, don't bother with a single scale factor; your running estimate already does that. Keep the month-by-month shape, and don't cap it too tightly if your climatology comes from a different product than the sun you sail under.

Limits: ERA5 stands in for the real sun, so this is a product-to-product mismatch, not a product-to-truth one. Nine high-latitude points, one learning year, and ±30% is one alternative cap, not a tuned one. Same boat, 50 W payload and calm-water daily model as before. Next we'll sweep the cap, fixed in advance, over all 30 points.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_level_season.py`, `experiments/results_level_season.txt`).
