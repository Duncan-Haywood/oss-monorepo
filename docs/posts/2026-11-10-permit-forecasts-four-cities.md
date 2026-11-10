---
title: "Permit duration forecasts across four cities: what transfers to Seattle and what doesn't"
seo_title: "Permit duration forecasts: does a model trained on other cities transfer?"
date: 2026-11-10
tags: [research, construction, permits, forecasting, open-data]
description: "A boosted quantile model beats per-city baselines in Seattle too, but a model trained on other cities only partly transfers, and its intervals under-cover."
---

The [build-data programme](../../research/build-data/) forecasts how long
building permits take (application to issue, issue to completion) from open
city feeds, with a forward-in-time split. Its paper now covers four cities:
Chicago, San Francisco, Austin and Seattle (public domain, 194,184 rows).

What the Seattle runs found, all in section 4.8 of the
[paper draft](../../research/build-data/paper/paper.md):

- The boosted model beats the per-type baseline at all three quantiles in both
  targets (19 of 21 city/target/quantile cells overall).
- A model trained on the other cities is worse at the 0.9 quantile for
  application-to-issue (+27% in 2023 and 2024). For issue-to-completion it
  beats Seattle's own baseline at q0.1 and q0.5 in both years, but the q0.9
  gain in 2024 (-5.1%) flipped to +11.2% in 2023, so it is not stable.
- Transfer intervals under-cover: 0.61 to 0.72 against 0.80 nominal.

Limits: two test years, three seeds, two source cities for the completion
target. Nothing new was computed this session; it folds earlier results into
the abstract.
