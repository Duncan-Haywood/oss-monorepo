---
title: "Is the simple permit-duration table really narrower? A bootstrap says mostly yes"
seo_title: "Bootstrap check of 80% interval widths for permit durations"
date: 2026-11-09
description: "A week-block bootstrap confirms which 80% permit-duration interval is narrowest in Chicago, San Francisco and Austin, with one near-tie."
tags: [research, build-data, construction]
---

# Bootstrapping the width of a permit-duration interval

The build-data programme publishes an 80% interval for how long a building permit takes in Chicago, San Francisco and Austin. The last run picked the narrowest calibrated interval per city, comparing single numbers. This run asks whether the gaps are bigger than week-to-week noise.

It re-pulled the three open feeds, rebuilt the 2024 intervals and bootstrapped the width difference between a three-key lookup table and the per-type baseline, resampling whole weeks. The new script reproduces the earlier coverages and widths, which checks it against the old run.

Result: all five 95% intervals exclude zero and agree with the earlier choice. The per-type baseline is narrower in four sets (for example Chicago application-to-issue: 55 days against 118). The table is narrower only for Austin issue-to-completion, by 34.5 days [32.1, 36.9]. Austin application-to-issue is a near-tie (+4.6 days, interval 0.2 to 9.3).

Limits: one test year, and the bootstrap holds the calibration fit fixed. Details: `research/build-data/paper/paper.md` section 4.7f and `LOG.md` session 60.
