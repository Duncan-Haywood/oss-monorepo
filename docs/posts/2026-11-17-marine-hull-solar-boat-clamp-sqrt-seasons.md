---
title: "A solar boat's sun correction should widen as its log grows, not as it sails north"
seo_title: "Solar USV sun correction: scale the clamp by √seasons, not latitude"
date: 2026-11-17
tags: [research, marine-hull]
description: "Scaling a solar boat's self-set correction clamp by √seasons cut its worst-case shortfall from 26.6 to 7.1 of 168 cases. A latitude switch did nothing."
---

A solar survey boat plans its battery use from a sunlight climatology. After a season or more at sea it can correct that climatology month by month from its own log. The [last step](2026-11-17-marine-hull-solar-boat-clamp-more-seasons.md) capped those learned month ratios at their own spread (AP). With three seasons of log that cap tied the best fixed cap on ordinary water. Its worst-case shortfall, though, grew to 26.6 of 168 cases, because a fixed ±15% cap won where the boat's ratios sat far from 1. Two explanations were on the table:

- **A scale error.** Pooling k seasons shrinks the noise in the ratios by about √k. So the spread understates a real bias once several seasons are pooled. Fix: multiply the spread by √k (AK).
- **A latitude effect.** The wide cap wins up north. Fix: use ±15% at 50 degrees of latitude and above, and the spread cap elsewhere (AB).

Both rules were written down, with ten predictions, before anything ran. The earlier rules reproduced their published counts exactly (21 checks).

What we found (seven of ten predictions held):

- **The √k scale works.** With three seasons, AK is never more than 7.1 cases behind the best of five earlier rules in any of four scorings. That is the smallest worst-case shortfall of any cap tested (spread cap 26.6, fixed ±15% 10.3). At the nine high-amplitude points it wins 89.0 cases against the spread cap's 74.5. It is also the best rule when the boat plans on one sunlight product and sails under another (57.5).
- **It costs on ordinary water.** On all 30 ocean points AK wins 154.5 against 159.5, and its worst triple of years (136) falls below no correction's 139. So it is the most robust rule, not the best one everywhere.
- **The latitude switch does nothing.** Switching eight of the nine high-amplitude points to ±15% moves the pooled count by under one case (75.3 against 74.5), yet ±15% alone scores 95.7 there. The pool adds up distance and dark hours over the nine points. The one point below 50 degrees (30°S in the Pacific) evidently carries that sum. The earlier "keep ±15% up north" advice was a 30°S effect, not a high-latitude one.

That last finding matters beyond this step. Several earlier "above 50 degrees" readings in this programme came from the same pooled count, and they now need restating on a pool that weighs each point equally.

Limits: every score is in-sample on the ten years 2005 to 2014. The √k scale was fixed by argument, not swept. The pairs and triples share years, so the ranges are observed ranges, not intervals. ERA5 stands in for the real sun. One boat, a 50 W payload and a calm-water daily model.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_k_aware_clamp.py`, `experiments/results_k_aware_clamp.txt`).
