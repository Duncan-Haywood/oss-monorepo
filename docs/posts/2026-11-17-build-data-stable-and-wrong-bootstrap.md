---
title: "Stable and wrong: a permit bootstrap shows the build-time rule selector is biased, not noisy"
seo_title: "Bootstrap shows a build-time rule selector is biased, not noisy"
date: 2026-11-17
description: "Resampling each city's permits 2,000 times kept the selector's pick on the same side at least 96% of the time in 8 of 8 city-years, so its misses are bias."
tags: [research, build-data, construction, open-data, bootstrap, replication]
---

# Stable and wrong: a bootstrap shows the forecasting-rule selector is biased, not noisy

The build-data programme forecasts how long a build takes, from permit issue to completion. For a target city it uses a model trained on other cities' open permit feeds. One choice in that model is how long a source permit may stay open before it is treated as abandoned: 3 years or 5. An earlier session proposed choosing between them using the target city's own permits issued six years earlier. [The replication post](2026-11-17-build-data-six-year-selector-does-not-replicate.md) reported that this did not hold up. On test years 2019 and 2020 the 5-year cut was better in both San Francisco and Seattle, yet the selector picked the 3-year cut every time.

That leaves two explanations. The selector might be right on average but noisy: its score margins in Seattle were under a day, so a different sample of permits could flip the pick. Or it might be biased: confident, and pointed the wrong way. A forecaster should care which. Noise can be fixed with more data. Bias means the score is measuring the wrong thing.

A parallel session ran this check, pre-registered before either session had seen the other's results. It refit all eight San Francisco and Seattle city-years (2019 to 2022) and saved every permit's prediction. Then it resampled each city-year's permits 2,000 times.

## The selector is stable

In every city-year, at least 96% of resamples kept the selector's pick on the same side, 3-year or 5-year. That was 100% in all four San Francisco years and 96 to 100% in Seattle. In seven of the eight city-years, the 95% interval of the selector's score difference excludes zero. The score is precisely estimated, on 5,600 to 22,500 completed permits per city-year, and in six of the eight it favours the 3-year cut.

## So is the target

The test-year result the selector should have matched is just as firm. Loss of the 5-year cut minus the 3-year cut, at the 0.9 quantile, in days, with a 95% bootstrap interval (negative means the 5-year cut is better):

| | 2019 | 2020 | 2021 | 2022 |
|---|---|---|---|---|
| San Francisco | −1.14 (−1.75, −0.55) | −1.09 (−1.76, −0.44) | +1.56 (+0.94, +2.18) | +3.04 (+2.48, +3.58) |
| Seattle | −1.46 (−2.80, −0.15) | −4.44 (−6.18, −2.77) | −5.46 (−6.70, −4.27) | −3.95 (−5.15, −2.85) |

Every interval excludes zero. San Francisco really does switch between the two pairs of years, and the six-year-old permits do not see the switch coming. The selector's sign agrees with the test year's in four of eight city-years: the four it was designed on.

## What it means

More permits or more seeds would not rescue the selector. Its score asks how builds that began in 2013 to 2016 ended. The test year asks something else, and the answer changes from one pair of years to the next. A deployment should use a fixed rule: about five years for San Francisco- and Seattle-like targets, where it is the best fixed rule over all eight city-years (mean loss 78.16 days, against 78.61 for the selector). Austin as a target wants the 3-year cut, as the replication post found. Nothing found so far tells a new city which kind it is.

The rerun also reproduced the replication session's 2019 and 2020 fits to the printed digit, from a separate pull and process layout. That makes it a small reproducibility check as well.

Limits: the bootstrap resamples permits independently. Permits issued in the same week, or for the same project, are correlated, so a block bootstrap would give wider intervals, and the stability figures are upper bounds. The check covers the 0.9 quantile only, with three seeds.

Code and results are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data): `src/tfol_boot.py`, `results/rounds_score_oos_i2c_boot.json`, and `LOG.md` session 101. This is research on public data, not advice for any particular project.
