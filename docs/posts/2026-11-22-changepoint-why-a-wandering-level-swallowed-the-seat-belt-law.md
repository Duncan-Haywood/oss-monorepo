---
title: "Why a wandering level swallowed the 1983 seat-belt law: the penalty, not the season"
seo_title: "Why a drift model missed the 1983 UK seat-belt law step"
date: 2026-11-22
tags: [changepoint-detection, statistics, pre-registration, state-space-models]
description: "The drift model's likelihood wander missed the UK seat-belt law. Seasonality was the guess; the cut saves 9.4 against a 10.5 penalty."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has a model for series whose level drifts:
between changes the level follows a random walk, and only a jump too big for the walk counts as a change. Since
11 November it picks how much the level may wander by likelihood, alongside the changes. That helped on most of the
38 labelled series in the Turing Change Point Dataset, but it lost two the older estimate had right. One is
the monthly count of UK drivers killed or seriously injured, where the front-seat seat-belt law of 31 January 1983 is
the best-known step in time-series teaching. The new fit finds no change there at all.

The note left at the time guessed why: "omega chosen high on a seasonal or trending series". This run tested that
guess, with the lines written down before the script ran (README, "Why the likelihood's wander absorbs a step").

## The season was not it

The series has a strong yearly cycle, and you can see it in the numbers the estimate starts from: the variance of
differences k months apart rises to k = 7 and falls back by k = 10. So the obvious test was to take each calendar
month's median off and fit again. The line said this would halve the chosen wander and bring back a cut at
February 1983. It did neither: the wander ratio fell from 0.51 to 0.29, not below 0.255, and there was still no cut.

## The arithmetic is

Holding each partition fixed and letting the wander find its best value shows why. At the wander the data supports,
the law is a jump of about 3.4 noise standard deviations (2.8 with the months taken off). Cutting there improves the
fit by 9.4 units of -2 log likelihood on the raw series and 7.2 on the deseasonalised one. A change costs 2 log 192 =
10.5. A level that already moves about half a noise sd every month can take a 3-sd step as a few months of
wander for less than the price of one change.

So this is not an estimator bug. The older estimate found the law only because it chose a stiffer walk (0.245), not
because it read the wander better. At this penalty the series really is ambiguous: a penalty of 1.78 log n or
less would cut there, but one series is no reason to move a default.

## The other loss was a different problem

On quality control 4 the step is found. The loss is two extra cuts. That series' level moves smoothly, with momentum,
so the lag variances grow faster than a walk allows, the fitted noise sd lands on the code's numerical floor (0.079
against a lag-1 sd of 0.79), and the fit then allows a lot of wander and cuts at 342, 360 and 440 where the
annotators marked only the first.

## Could a flag have warned beforehand?

Two flags were fixed in advance: "sigma is the floor" and "the lag variances peak and fall back". They cover 6 of the
8 series where the likelihood loses by more than 0.05 F1. But the floor flag fires on 21 of 38 series, and on those the
likelihood does as well as the older estimate on average. Flagged series as a whole come out slightly ahead
(+0.015), so the second line failed and no warning ships. The one change is that the noise estimate now says when its
sigma is the floor and not an estimate.

## What next

A floored sigma says the walk-plus-noise shape is wrong for the series; a walk with a trend in it is the natural
next model to pre-register on those 21 series. For a reader who already knows the date, a line like "a cut at 1983-01
would save 9.4 of the 10.5 a change costs" would show how close the fit came.

All results are estimates on public labelled data, not advice. Script: `eval/drift-ml-absorbs.mjs`; output and test
beside it.
