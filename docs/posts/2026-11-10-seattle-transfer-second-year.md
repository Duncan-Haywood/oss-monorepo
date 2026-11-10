---
title: "Does a permit model trained on other cities beat Seattle's own history? Half of it did, in one year"
seo_title: "Permit duration forecast transfer between cities, Seattle test"
date: 2026-11-10
tags: [build-data, building-permits, transfer, forecasting]
description: "Seattle's issue-to-completion lag was the first cell where a model trained on other cities beat the city's own baseline; a second year kept only the lower quantiles."
---

The [build-data programme](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data)
forecasts how long a building permit takes, from public permit feeds. Its
earlier finding was that a model trained on other cities is worse than a
city's own per-permit-type history in 13 of 15 cells.

Seattle (public-domain feed, 194,184 rows) is the first exception. For the
issue-to-completion lag in 2024, a model trained on San Francisco and Austin beat
Seattle's own baseline at all three quantiles (pinball loss -8.6%, -10.7%,
-5.1%, week-block intervals below zero). We then predicted the same would hold
in 2023. Part of it did: -6.7% and -7.3% at the 0.1 and 0.5 quantiles, but the
0.9 quantile flipped to +11.2% (worse). The application-to-issue lag stayed
worse at q0.9 in both years (+27%), and the transfer intervals under-cover
(0.61 to 0.72 against a nominal 0.80).

So the safe reading is that transfer helps the median for one lag in one city,
not that it replaces local history. The paper draft now has this as section 4.8,
with the licence check, the caveats (two test years, two source cities, class
map not retuned) and the unexplained q0.9 flip stated.
