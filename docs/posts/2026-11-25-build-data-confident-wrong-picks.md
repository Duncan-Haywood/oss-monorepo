---
title: "The build-time chooser is most sure of itself exactly where it is wrong"
seo_title: "A permit forecasting chooser is most confident where it is wrong"
date: 2026-11-25
description: "A seed-noise guard on a build-time model chooser made pooled regret worse, 1.62 to 2.16 days, because its wrong picks in San Francisco were its most confident."
tags: [research, build-data, construction, open-data, model-selection]
---

# The build-time chooser is most sure of itself exactly where it is wrong

The build-data programme forecasts how long construction takes, from permit issue to completion. It borrows a model trained on other cities' open permit feeds (San Francisco, Seattle, Austin) and uses only what was known on 1 January of the test year. One choice matters a lot: how long a source permit may stay open before the training data drops it as stale. The menu runs from 1 year to 5 years. Austin, whose builds are short, wants 1 year. San Francisco and Seattle want 3 to 5.

The [last post](2026-11-19-build-data-two-regimes-not-five-cuts.md) scored a chooser that picks the cut for each city and year itself. It scores each cut's model on the target city's own permits issued six years earlier and completed by the decision date, then takes the lowest. Over 18 city-years it was the best rule tested: 1.62 days of 0.9-quantile regret against the best cut in hindsight. Its remaining cost was a lean towards short cuts in San Francisco 2017 to 2021, where they are wrong.

## The idea, fixed before looking

Every model in the comparison was trained with three seeds, and the saved results keep the chooser's score for each seed. So the chooser can see how much its own score moves when only the seed changes. The natural guard, borrowed from cross-validation's one-standard-error rule: take the longest cut whose score is within one seed spread of the winner. A shorter cut then has to win by more than the noise. We fixed three versions of this guard and eight predictions in a commit before reading any per-seed number. No new model was fitted, so the whole test runs in under a second.

## What happened

Mean regret against the best cut in hindsight, days:

| rule | all 18 | SF and Seattle (12) | Austin (6) | worst city-year |
|---|---|---|---|---|
| plain chooser | **1.62** | 2.28 | **0.32** | 6.03 |
| one-spread guard | 2.16 | 2.32 | 1.86 | 5.75 |
| standard-error guard | 1.69 | 2.35 | 0.35 | 6.03 |
| regime guard (1-year cut only if it wins by its own spread) | 1.75 | 2.24 | 0.77 | 5.75 |

All three guards do worse than the plain chooser. Three of the eight predictions held, and the primary one did not.

The reason is the useful part. The winning cut's seed spread is 0.06 to 0.47 days in the five San Francisco years where the chooser wrongly goes short. It is 1.3 to 11.0 days in Austin, where going short is right. A margin built from that noise leaves San Francisco alone and pushes Austin off its best cut. Scaling the margin up only makes things worse: pooled regret rises steadily from 1.62 with no margin to 7.39 at ten times the spread.

## What it means

The chooser's San Francisco error is not noise in its score, so more seeds would not fix it. It looks like a bias of the cohort it scores on. Permits issued six years before the decision date and already complete can only include builds that took six years or less. A likely mechanism, not yet tested, is that a model trained without stale open permits predicts that truncated cohort well and the real long tail badly. The next guard should measure how much of the cohort is still open, or whether the five- and six-year-old cohorts agree, rather than how much the seeds disagree.

For anyone choosing a forecasting rule this way: keep the plain chooser over 1 to 5 years, and do not widen it by its own seed spread.

The code is [`research/build-data/src/guard5.py`](../../research/build-data/src/guard5.py), the output is [`results/guard5_i2c.txt`](../../research/build-data/results/guard5_i2c.txt), and the pre-registration and full outcome are in the [research log](../../research/build-data/LOG.md), session 109.
