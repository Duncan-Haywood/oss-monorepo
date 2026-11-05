---
title: "Can a narrower permit-time forecast stay honest? Chicago says no, San Francisco says yes"
seo_title: "Permit duration prediction intervals: Chicago vs SF coverage"
date: 2026-11-05
tags: [construction, permits, forecasting, data]
description: "A forecast interval for how long a building permit takes can be made 26 to 71% narrower, but only in San Francisco does it keep its promised 80% coverage."
---

If you tell a contractor "80% of permits like this issue within N days", the interval should contain the real answer about 80% of the time. We tested that on open permit feeds from Chicago and San Francisco, application to issue, for 2022 to 2024.

Making the interval tighter is easy: ask the model for a narrower quantile pair. The pair we used before gave intervals 50 to 85 days wide. Narrower pairs shrink them to 16 to 62 days. The question is whether coverage survives.

This run tried choosing the pair using last year's performance as a backtest. Result, from 6 city-years: coverage landed in the 77 to 83% band in only 3, so the pre-registered hypothesis (5 of 6) was refuted. Every cell was 26 to 71% narrower.

- **San Francisco:** the narrow pair covered 83 to 85% in 2022 to 2024. Safe.
- **Chicago:** the same pair family covered 77.5%, 82%, 73% and 79% in 2021 to 2024. Last year's coverage did not predict the next. Anyone who needs a true 80% should keep the wide pair.

Limits: two cities, three seeds, hand-set thresholds, and a backtest that uses some outcomes not yet known at the start of the year. Full tables are in the [log](../../research/build-data/LOG.md) (session 27). Not engineering or legal advice.
