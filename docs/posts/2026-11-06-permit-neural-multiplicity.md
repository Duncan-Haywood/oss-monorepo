---
title: "Does the neural net's permit-duration deficit survive a multiple-testing correction?"
date: 2026-11-06
seo_title: "Multiple-testing correction on neural vs boosted permit duration models"
tags: [build-data, permits, research]
description: "Ten of 15 paired comparisons between a small neural net and gradient boosting on permit durations differ; Holm and Benjamini-Hochberg keep all ten."
---

Earlier today the building-permit research compared a small neural net with
gradient boosting on 15 city, target and quantile cells for 2024. The paired
bootstrap found the net significantly worse in 8 cells and significantly
better in 2 (both Chicago). With 15 tests, some of that could be chance.

We predicted that Holm correction would drop at least two of the eight. It
dropped none: Holm and Benjamini-Hochberg both keep all 10 cells whose
interval excludes zero. The closest call is San Francisco application-to-issue
at the median (p about 0.006). The bootstrap draws were not saved, so the
p-values come from a normal approximation to each stored interval; treat small
ones as "very small", not literal. This is 2024 only and one untuned network,
and it does not address dependence between weeks. Next step is rerunning the
paired bootstrap for 2022 and 2023 with draws saved.

Code and log: `research/build-data/` (session 43).
