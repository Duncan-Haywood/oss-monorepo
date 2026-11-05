---
title: "A narrower prediction interval for Austin build times does not hold up"
date: 2026-11-05
---

We predict how long a permitted build takes in Austin, Texas (issue to completion), with an interval meant to cover 80% of real permits. Last session we found that in Chicago and San Francisco a narrower choice of quantile pair, picked with a one-year backtest, cut interval width by 44 to 71% for application-to-issue time. We pre-registered the same test for Austin build time and it failed.

Over test years 2022 to 2024 the chosen interval covered 78.6%, 84.2% and 83.5% of permits, so only one year landed in the 77 to 83% target, and it was narrower than the fixed (0.1, 0.9) pair by 15% or more in one year of three (18% in 2024; 6% in 2023). The intervals are 240 to 310 days wide. The plain pair's coverage also drifted ten points between 2021 and 2023 (0.731 to 0.837), so year-to-year shift matters more than the choice of method.

One seed, three cells, public City of Austin open data; no affiliation with the city; AI-assisted analysis. Code and numbers: `research/build-data/` (log session 31).
