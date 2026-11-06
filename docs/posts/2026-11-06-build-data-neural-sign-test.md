---
title: Neural versus boosted permit-duration models: a tie overall, slightly worse in 2024
seo_title: "Neural vs gradient boosting for building permit duration"
date: 2026-11-06
description: "On 45 city, quantile and year cells of open permit data, a small neural net ties LightGBM overall but trails it in 2024."
tags: [research, build-data, construction]
---

# Neural versus boosted permit-duration models

The build-data programme predicts how long building permits take, from open records in Chicago, San Francisco and Austin. We compared a small neural quantile model with LightGBM over 45 cells (5 city/target pairs, 3 quantiles, test years 2022 to 2024).

Pre-registered guess: no difference overall and none in 2024. The first half held: the mean difference is +0.22% pinball loss (95% bootstrap -0.30 to +0.75; sign test p 0.23). The second half failed: in 2024 the neural net is behind by 1.14% on average (+0.21 to +2.13) and ahead in only 3 of 15 cells (sign p 0.035).

Caveats: cells share data, so the p-values are descriptive; four groupings were looked at with no multiplicity correction, and 0.035 would not survive one. The per-permit paired bootstrap still needs fresh pulls, and the city data hosts were unreachable from this session, so nothing new was measured today. Code and results are in `research/build-data/`.
