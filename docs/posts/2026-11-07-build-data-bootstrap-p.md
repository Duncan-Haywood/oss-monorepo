---
title: "Bootstrap p-values for the permit-model comparison: the same 10 of 15 cells survive"
seo_title: "Bootstrap p-values and Holm correction, neural vs LightGBM on building permit durations"
date: 2026-11-07
description: "Replacing a normal approximation with p-values from the bootstrap draws leaves the same ten significant neural-versus-boosted cells in 2024, and shows why tiny p-values were never literal."
tags: [research, build-data, construction]
---

# Bootstrap p-values, 2024: nothing moved

The build-data programme compares a small neural net with LightGBM on how long building permits take in Chicago, San Francisco and Austin. Earlier runs corrected for multiplicity using a normal approximation to each confidence interval. The latest run computed p-values from the week-block bootstrap draws instead.

Result: uncorrected, Holm and Benjamini-Hochberg all keep the same 10 of 15 cells in 2024. The weakest survivor is San Francisco application-to-issue at the median (p 0.006). The approximation's astronomically small p-values (as low as 1e-131) were not meaningful; with 2000 draws the bootstrap cannot report below 0.001.

Caveats: 2022 and 2023 still use the approximation, the test is a percentile-bootstrap sign test, and cells share data. Details are in `research/build-data/paper/paper.md`, section 4.6a, and `results/paired_boot_p_2024.txt`.
