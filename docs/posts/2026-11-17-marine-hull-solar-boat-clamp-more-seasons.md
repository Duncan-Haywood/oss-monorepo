---
title: "With three seasons of log, a solar boat's self-set clamp beats the pooled correction, but not up north"
seo_title: "Solar USV sun correction with 2 to 3 seasons: self-set clamp vs pooled"
date: 2026-11-17
tags: [research, marine-hull]
description: "With two or three seasons of its own sun log, a solar boat that clamps its correction to the log's own spread wins 159.5 of 168 cases, against 155.5 pooled."
---

A solar survey boat plans its battery use from a sunlight climatology, and after a season at sea it can correct that climatology month by month. The [last step](2026-11-17-marine-hull-solar-boat-adaptive-clamp.md) found that it can set the cap on those learned ratios from the ratios themselves. The proportional rule (AP) caps each ratio at the ratios' own mean distance from 1, and with one season of log it was the safest rule tested. This step asked what happens with two and three seasons of log, and whether AP then beats the band-pooled cosine (HR), the rule that an earlier step found safe in both pools from three seasons.

We scored every pair and every triple of learning years, ten of each. The predictions were written down before the run. Every rule from earlier steps reproduced its published counts exactly (13 checks). A case is won when the boat travels at least as far as a 7-day trailing-mean baseline with no more hours running dark.

What we found (seven of ten predictions held):

- **On the pooled cases AP beats the pooled cosine at both history lengths.** On all 30 ocean points it wins 158.1 of 168 cases with two seasons and 159.5 with three. HR wins 151.9 and 155.5, and no correction wins 139. At the nine high-latitude points AP wins 74.5 against HR's 56.7.
- **Three seasons is enough for both floors.** AP's worst triple of years scores 155 and 33, above no correction's 139 and 25. With two seasons its worst high-latitude pair falls to 7.
- **Point by point, HR still leads.** Scored at each point on the real climatology, HR wins 142.6 of 240 against AP's 134.2. AP's lead comes from the pooled cases.
- **The spread narrows as the log grows.** AP's average cap on ordinary water goes from ±6.3% to ±5.1% to ±4.6%. On ordinary water that is what we hoped for: AP ties the best fixed cap (±3%: 159.6 against 159.5). But the cap also narrows when the boat plans on one sunlight product and sails under another (±12.0% to ±9.9%), and that was not the plan.
- **Up north, a wide cap wins again.** With three seasons the old fixed ±15% cap wins 95.7 at the high-latitude points and 100.4 when the plan is brighter than the sea. AP wins 74.5 and 73.8. So AP's worst-case shortfall grows from 13.8 cases with one season to 26.6 with three. The ±15% cap now has the smallest worst-case shortfall (10.3), and all of that cost falls on ordinary water.

For a designer with three seasons of log: on ordinary water, cap the correction at its own spread (or at ±3% if the climatology and the sea are known to agree). Above about 50 degrees, keep ±15%. The spread rule's scale is the likely fault. Averaging k years shrinks the noise in the ratios by about the square root of k, so a mean distance from 1 understates a real bias once several years are pooled. A cap of spread × √k is the next rule to fix in advance and test.

Limits: every score is in-sample on the ten years 2005 to 2014 that every step since 6zzj used. The pairs and triples share years, so the ranges are observed ranges, not intervals. ERA5 stands in for the real sun. HR was scored only with NASA POWER sunlight. One boat, a 50 W payload and a calm-water daily model.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_multi_season_clamp.py`, `experiments/results_multi_season_clamp.txt`).
