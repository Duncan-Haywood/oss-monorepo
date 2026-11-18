---
title: "How many seasons of its own log does a solar boat need? One near the equator, four near the poles"
seo_title: "Solar USV seasonal correction: how many seasons of log?"
date: 2026-11-16
tags: [research, marine-hull]
description: "Sixteen simulation steps on a solar survey boat's learned sun correction, compiled into one table: one season works on ordinary water, four at high latitude."
---

A solar survey boat sets its speed from a sun climatology: ten years of NASA POWER irradiance, averaged by month. That climatology is a little wrong in a different way each month. Over the last sixteen steps of the [marine-hull programme](../../research/marine-hull/) we asked whether the boat can learn that error from its own log of harvested energy, and how many seasons of log it needs before the learned correction is safe to use.

We have now put every answer into [one table](../../research/marine-hull/experiments/results_history_length_table.txt). A short script writes it straight from the earlier results files and recomputes nothing. The table also became a section of the [paper draft](../../research/marine-hull/paper/DRAFT.md).

Each rule is scored on 168 test cases (30 ocean points, two five-year halves, four battery sizes, 21 bias shapes). It wins a case when the boat goes at least as far as a plain 7-day trailing-mean rule and spends no more hours with a flat battery. With no correction at all, the boat wins 139 of the 168 cases. At the nine high-latitude points, where the climatology's seasonal error is 4.5 to 8.5%, it wins only 25.

The table gives three answers:

- **On ordinary water, one season is enough, if you pool it.** Fitting a yearly cosine to the log and pooling it with other boats in the same latitude band wins 140 to 153 cases. That is at or above the uncorrected 139 for every one of the five learning years we could draw. Using the raw month-by-month ratios from a single year averages 122, below no correction, because one year's weather is larger than the error it is trying to fix.
- **At high latitude, no one- or two-season rule tested is safe in every year.** The raw ratios average 81 of 168 there, against 25 uncorrected, but one ordinary year takes them down to 1. A guard that refuses any summer learned darker than the climatology lifts that worst year to 74. The same guard then costs about 16 cases across the whole ocean, all on battery reserve.
- **Four seasons of raw log is the only rule tested that never falls below "no correction" on both counts.** With four seasons the worst draw is 143 of 168 overall and 81 at high latitude.

The main caveat is how few draws there are. Five learning years give five one-season draws and ten two-season pairs, so the ranges above are what we observed, not confidence intervals. The pooled rules were never scored with three or more seasons on every subset of years. Everything is one simulated boat and one payload, and the sunlight data comes from NASA POWER alone. The next step is to score the pooled rules at three and four seasons: that test decides whether a boat can cross both floors with fewer years of log.

Written with AI assistance (Claude Code). Simulation only; nothing here has been tested on the water.
