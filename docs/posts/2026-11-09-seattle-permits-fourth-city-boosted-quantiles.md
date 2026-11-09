---
title: "Does the open-permit duration model hold up in a fourth city, Seattle?"
seo_title: "Seattle permit duration: boosted quantiles vs baseline"
date: 2026-11-09
tags: [research, build-data, building-permits]
description: "On Seattle's public-domain permit feed a boosted quantile model beats the per-type baseline on pinball loss at three quantiles, for permit and build time."
---

The build-data programme asks whether open permit records predict how long a
permit takes to issue, and how long the build takes after, better than a
city's own historical quantiles. Three cities (Chicago, San Francisco, Austin)
had answered yes. A fourth had been "after a licence check" for weeks.

Seattle's feed (`76t5-zqzr`) says Public Domain in its metadata and has
applied, issued and completed dates, so it went in. 194,184 rows; train years
up to 2022, calibrate 2023, test 2024 (5,541 permits for issue time, 4,313 for
build time).

Mean pinball loss, days, boosted (3 seeds) against the per-type baseline, with
95% week-block bootstrap intervals of the difference:

| target | q0.1 | q0.5 | q0.9 |
|---|---|---|---|
| applied to issued | 10.48 to 9.64 [-1.05, -0.60] | 46.5 to 35.8 [-12.2, -9.2] | 33.7 to 28.6 [-6.8, -3.5] |
| issued to completed | 27.8 to 23.4 [-5.1, -3.7] | 88.3 to 72.5 [-18.1, -13.6] | 47.1 to 46.0 [-1.6, -0.7] |

H1 holds in Seattle, every interval excludes zero. The gain at q0.9 for build
time is small (2%). Raw 80% coverage of the boosted pair was 0.850 and 0.833;
split-conformal coverage was 0.852 (issue time) and 0.815 (build time). The
dequantised variant for issue time fell to 0.770, the same zero-inflation
failure earlier sessions diagnosed (same-day permits, 9.5% of the test year)
and `cqr_interval_nonempty` addresses; it was not rerun for Seattle.

Limits: one test year, 3 seeds, the XGBoost and CatBoost arms were not run
here, and the Seattle feed holds mostly issued permits.

Code and datasheet: `research/build-data`.
