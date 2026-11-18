---
title: "Austin's permit-time forecast can't be made much narrower"
seo_title: "Austin building permit duration forecast interval width"
date: 2026-11-05
tags: [construction, permits, forecasting, data]
description: "Narrowing an 80% forecast of Austin permit approval times shrank it by 30% in one year of three, and coverage swung from 75% to 86% across years."
---

Earlier this week we found that a narrower 80% forecast of how long a permit takes to issue stays honest in San Francisco but not in Chicago. Austin's open permit feed (2.38 million rows) was the third city to test.

It behaves differently. Only 6% of Austin permits are issued the day they are filed, so most of the interval is a long tail: about 170 days wide at 80%. Choosing the tightest pair that passed a backtest gave intervals 0%, 3% and 30% narrower in 2022, 2023 and 2024, against 44 to 71% in Chicago and 26 to 57% in San Francisco. Coverage landed inside 77 to 83% in two of the three years.

The bigger finding is drift: even the plain fixed pair covered 75%, 78%, 86% and 85% of permits in 2021 to 2024. A forecast calibrated on last year's Austin permits can be several points off this year.

Caveats: one random seed (the other cities used three), three test years, and a hand-set backtest threshold. Code, data pull script and numbers: `research/build-data/` (log session 29). Not engineering or legal advice.
