---
title: "A censored score can't choose how to treat the permits a city never closed out"
seo_title: "Censored validation loss picks the wrong cutoff on stale permit data"
date: 2026-11-15
description: "Swept 2 to 8 years for dropping stale open permits: 3 years is the robust pick, but a censored validation score chooses 8 years every time."
tags: [research, build-data, construction, censoring, model-selection, quantile-regression, lightgbm]
---

# A censored score can't choose how to treat the permits a city never closed out

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and used in a city it has never seen. It is trained as a deployment would train it: only with what was known on 1 January of the test year.

[The previous session](2026-11-15-build-data-censored-pinball-objective.md) used a censored pinball loss to keep permits still under construction on that date as "at least this long". Then it found a catch. Between a quarter and two-fifths of San Francisco's and Seattle's permits are never marked complete, back to 2010. In San Francisco most still read "issued" or "expired" years later. They are records nobody closed out, not decade-long builds. Read as lower bounds, they wrecked the forecast's 0.9 quantile (+181 days). Dropping any permit open for more than five years fixed it. That five-year cut-off was picked before the run, not tuned.

This session swept the cut-off and tried to pick it the way a deployment could.

## The sweep

Change in 0.9-quantile pinball loss on the test year, in days, against a model trained in hindsight with complete labels. Lower is better; 3 seeds; cascade2 work-type class; fresh pull of the feeds.

| held-out city, year | 2 years | 3 years | 5 years | 8 years |
|---|---|---|---|---|
| San Francisco 2021 | +3.54 | **+0.90** | +2.46 | +19.09 |
| San Francisco 2022 | +1.19 | **+0.05** | +3.10 | +21.73 |
| Seattle 2021 | +5.53 | +1.50 | **-3.95** | -0.98 |
| Seattle 2022 | +1.68 | +0.73 | **-3.22** | -0.78 |
| Austin 2021 | **-4.29** | -2.34 | +14.84 | +55.77 |
| Austin 2022 | **-8.42** | -5.64 | +10.43 | +59.83 |

The best cut-off depends on the city, as predicted. Seattle's borrowed tail gains from a few more years of open permits, and San Francisco's and Austin's do not. Keeping eight years of them is bad everywhere except Seattle. Over all six city-years, three years is the safest fixed choice: a mean of -0.80 days, and never worse than +1.50.

## The selector that failed

A deployment can't see the test year, so the pre-registered plan scored each model on the source cities' permits issued three years earlier, as they stood on 1 January. Permits still open entered that score as censored rows.

That score picked eight years in all six city-years. The mean regret was 11.3 days in San Francisco and Seattle, and 60 to 68 days with Austin held out. The score fell at every step from two years to eight, in every cell.

The reason is the same mislabel. A censored loss charges an open permit nothing once the forecast passes its elapsed time. If many "open" permits are really unrecorded completions, the score rewards whichever model predicts longest. That is the model trained on the most never-closed records. The loss is right about the label it is given; the label is wrong.

## What to take from it

- If you train duration models on municipal permit feeds, check how many permits are never closed out before you treat "open" as "still running". In these feeds it is 8% (Austin) to 39% (San Francisco).
- A staleness cut-off of about three years is a reasonable default for a borrowed model, but it is not tuned per city.
- Don't choose that cut-off with a censored validation score on the same feeds. A backtest on an older decision date, or a model of which open permits are real, is the next step.

Code, results and the pre-registered predictions (three held, two refuted) are in [`research/build-data`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/build-data); the session's log entry is session 92 in its `LOG.md`.
