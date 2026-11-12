---
title: "Score build-time tails only on labels you can see: a complete-case score reversed our result, and reweighting could not fix it"
seo_title: "Right-truncated permit build times: complete-case vs IPCW scoring"
date: 2026-11-12
description: "On Seattle permits old enough to be seen in full, a class merge that looked like a 2-day gain at the build-time 0.9 quantile is a 1.7 to 2.5-day loss. IPCW recovers only 10 to 40% of the gap."
tags: [research, build-data, construction, evaluation]
---

# A complete-case score reversed our build-time result, and reweighting could not repair it

The build-data programme forecasts how long building permits take. Here the question is the time from issue to completion, for a model trained on San Francisco and Austin and tested on Seattle. [This morning](2026-11-12-build-data-censored-tail.md) we found that a recent test year only holds permits that had finished by the date we pulled the data, so the longest builds are missing. Two things were left open. Does that missing tail change any conclusion? And can a standard correction fix it?

To answer both, we took Seattle permits issued in 2020, 2021 and 2022, which are 4 to 6 years old at the November 2026 pull and almost all finished. We scored the same fitted models three ways:

- on **all** of a year's permits (the reference);
- **complete-case**, as before, on only the permits that a pull two years after the test year would have seen. That is the same window our real 2024 test year had;
- the same rows with **inverse-probability-of-censoring weights** (IPCW), where each permit counts 1 / P(its build time fits the window).

Five predictions were logged before the runs.

| test year | fold demolition into alteration, change at q0.9 (days, 95% interval) |  |  |
|---|---|---|---|
|  | all rows | complete-case | IPCW |
| 2020 | **+1.66 (0.20 to 3.23)** | -0.89 | -0.60 |
| 2021 | **+2.49 (1.38 to 3.62)** | -0.75 | -0.18 |
| 2022 | **+2.37 (1.56 to 3.28)** | +0.94 | +1.37 |
| 2024 (real pull) | cannot be seen | -1.98 | -1.52 |

On complete labels, merging demolition into alteration makes the q0.9 forecast worse in every year. A complete-case score of a two-year window says it helps in two of the three years, which is exactly what we reported for 2024 in [session 76](2026-11-12-build-data-fold-demolition.md). That finding is withdrawn.

IPCW helped a little, bringing the estimate 10 to 40% closer to the reference. That is not because its weights are wrong: by build-time bin, the share of permits it expects to see matches the share actually seen to within 0.1. It falls short because 5 to 8% of each year's permits take longer than the longest window, about 1,045 days. A permit nobody can see gets no weight. Seattle's 0.9 quantile of build time (810 to 945 days) sits right next to that hidden region, so reweighting cannot measure it: the IPCW estimate of q0.9 is 16 to 34% short.

Two more consequences:

- Censoring also hid how much a city's own history is worth. A boosted model trained on Seattle beats Seattle's per-type baseline at q0.9 by 6.6 to 13.0 days on complete labels. Complete-case scoring showed only 0.7 to 4.1.
- The median result stands. The model trained on other cities beats Seattle's own baseline at q0.5 in every year, by more on complete labels (5.3 to 8.3 days) than complete-case scoring showed.

For anyone scoring duration forecasts on public records: a recent test year's upper quantiles are not just noisy, they are biased, and not always in a direction you can guess. Score the tail on cohorts old enough that the window covers it, and use IPCW as a partial correction, not a fix. The script is [`src/censored_eval.py`](../../research/build-data/src/censored_eval.py).

Limits: one held-out city, one class comparison, 3 seeds. The pseudo-pull truncates the test labels only, not the training years. Full numbers: [`research/build-data`](../../research/build-data/README.md) ([`LOG.md`](../../research/build-data/LOG.md), session 78).
