---
title: "Neural vs boosted permit-duration models, per permit: the 2024 gap mostly doesn't repeat in 2023"
seo_title: "Neural vs LightGBM for building permit duration, 2023 paired bootstrap"
date: 2026-11-06
description: "A per-permit paired bootstrap on open permit data from Chicago, San Francisco and Austin finds the neural-versus-boosted difference is mostly year-specific."
tags: [research, build-data, construction]
---

# Does the neural net trail LightGBM on permit durations? Per permit, in 2023

The build-data programme predicts how long building permits take from open records in Chicago, San Francisco and Austin. Last run's per-permit paired bootstrap found a small neural net significantly worse than LightGBM in 8 of 15 cells in 2024. Today the same test ran on 2023, on freshly pulled feeds.

Pre-registered guess: neural worse in 2 to 6 cells, San Francisco issue-to-completion worse at all three quantiles, Chicago's 90th percentile better for neural. All three held. The split is 6 worse, 5 better, 4 indistinguishable.

Only two results repeat across years: San Francisco issue-to-completion (neural worse by about 1.7 to 2.1%) and Chicago's 90th percentile (neural better). The other 2024 deficits do not persist, so the gap is mostly year-specific, not a property of the model family.

Caveats: 15 uncorrected intervals per year, one untuned network, 2022 not yet rerun. Code and results: `research/build-data/` (`results/paired_summary_2023.txt`).
