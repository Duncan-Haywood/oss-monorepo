---
title: "Which years a solar boat learns from matters more than how many"
seo_title: "Solar USV seasonal correction: which learning years, measured"
date: 2026-11-15
tags: [research, marine-hull]
description: "On all 31 subsets of learning years, a solar boat's learned seasonal correction beats no correction from two seasons on average, not three."
---

A solar boat plans its battery use from a sun climatology, and that climatology is wrong in a seasonal way. One fix the programme has tested is to learn the error from the boat's own log: a harvest-to-climatology ratio for each month, applied to the climatology. In milestone 6zzb we asked how many years of log that takes and answered "about three". But that test learned from one fixed set of years each time: the k years next to the season being scored. So more years always meant older years, and one year always meant one particular year. Every step since has listed that as a limit.

This step removes it. The same 168 cases (NASA POWER daily sunlight 2005 to 2014, 30 ocean points, four battery sizes, the climatology's real error plus 20 added seasonal biases) are scored once for every subset of the other half's five years: 31 sets of one to five years. We committed eight predictions before running anything. The nearest-year sets reproduce 6zzb's numbers exactly. Five predictions held.

What came out:

- **6zzb drew the worst year.** Learning from the year next to the scored season wins 97 of 168 cases. The other four single years win 117, 132, 152 and 111. For pairs, 6zzb's nearest pair (116) ranks last of all ten.
- **Two seasons are enough on average.** Averaged over which years are learned, the correction wins 121.8, 140.8, 149.3, 152.2 and 158.0 of 168 for one to five years. No correction wins 139. At the nine high-latitude points the average rises steadily from 81 to 105 (no correction: 25), so the two-year peak 6zzb saw there was the luck of the draw.
- **Recency doesn't show up.** Over a five-year window, recent years teach no better than older ones (Spearman rho +0.40 over the five single years, permutation p about 0.5). What matters is the weather in the learning years: a 55-case swing between the best and worst single year, and 1 to 153 at the high-latitude points.

This also changes how to read the last six milestones. Every one-season shrinkage rule there learned from the nearest year, the worst one for the raw correction. So their verdict that one season can't beat no correction rests on one draw. The next step reruns them over all five single years before that result goes into the paper.

For a team running solar boats: two seasons of the boat's own log are enough on average to correct the climatology month by month. The spread is wide, though (one unlucky pair still scores below no correction), so ship the correction with its own uncertainty or shrink it.

Limits: five years per half, so the subsets share years and the recency test has little power. Lag and calendar year are tied. Only the raw correction was rerun. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzi). Written with AI assistance.
