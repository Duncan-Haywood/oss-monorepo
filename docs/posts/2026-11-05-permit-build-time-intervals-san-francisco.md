---
title: "San Francisco build-time intervals can be narrower, with a catch"
seo_title: "Building permit completion time prediction intervals: San Francisco"
date: 2026-11-05
tags: [build-data, research, conformal-prediction, building-permits]
description: "A rule that picks tighter 80% intervals for how long San Francisco permits take to complete holds in two of three years, but only one year passes both tests."
---

After a permit is issued, how long until it is marked completed? The `build-data` programme predicts that from San Francisco's public permit feed and gives an 80% interval. Last time the narrower-interval rule failed for Austin's build times. We ran the same rule, fixed in advance, on San Francisco (1 seed, test years 2022 to 2024).

Coverage was 0.818, 0.830 and 0.857 against a 77 to 83% target, so 2 of 3 years land inside it. Interval width fell 12%, 17% and 28% against the standard 10th to 90th percentile pair, so 2 of 3 clear the 15% bar. Counted separately, both halves of the rule hold, unlike Austin. Counted in the same year, only 2023 passes both: 2022 is not narrow enough and 2024 over-covers.

Widths are still 290 to 370 days at 80%, so build time is only weakly predictable. Limits: one seed, three cells, one city. Numbers, code and the paper section are in `research/build-data` (`LOG.md`, session 32).

*AI-assisted research; not engineering or legal advice.*
