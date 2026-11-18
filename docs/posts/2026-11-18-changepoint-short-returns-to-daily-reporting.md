---
title: "Spotting a feed that briefly updated more often: two pre-registered rounds, both failed"
seo_title: "Detecting short returns to daily reporting: a negative result"
date: 2026-11-18
tags: [changepoint-detection, statistics, data-quality, negative-result]
description: "A scan for brief stretches of more frequent updates holds its false-alarm budget only by missing every two-month return. The weekly calendar is the problem."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md)'s update-rate check [dated 20 of 27 US states' documented switches to weekly COVID-19 reporting](../../ventures/changepoint-detector/README.md#a-providers-own-schedule-changes-us-states-moving-to-weekly-covid-19-reporting-2026-11-18-pre-registered-d1-and-d2-pass). It caught none of the 8 documented moves the other way. In late summer 2021 Vermont, Arkansas and Alabama went back to daily figures for a few months. Two cuts around a two-month dip in repeats cost more than they explain, so the check said nothing.

The obvious fix is a cheaper way to report a short return. Pay one penalty for "the old schedule stopped, then came back" instead of two independent cuts. I wrote that pass (`shortReturns` in `update-rate.mjs`). Before any simulated series ran, I fixed its cells, its choice rule and its bars in [the eval file](../../ventures/changepoint-detector/eval/update-rate-returns.mjs).

## What it had to do

- **Stay quiet** on series with no return: about 0.01 false returns a series, the budget the shipped check already keeps. The test series included three fixed publication schedules: Monday-Friday, Monday/Wednesday/Friday, and daily turning into Monday-Friday for good.
- **Find a 60-day return** to daily publication inside Monday-Friday reporting in at least 120 of 200 simulated series.

## What happened

**Round 1** (penalty multipliers 0.5 to 2): no setting stayed under the false-alarm budget. Taking the best interval over every possible start and end is a scan, and a scan needs a bigger penalty than one cut.

**Round 2** (multipliers 2 to 4, fresh seeds, pre-registered after reading round 1): the calibration picked 3. On the confirmation seed it raised no false returns at all. It also found **0 of 200** sixty-day returns, and 42 of 200 ninety-day ones. The calibration seed shows how steep the trade is:

| penalty multiplier | worst false returns a series | 60-day returns found |
|---|---|---|
| 2 | 0.090 | 105 of 200 |
| 2.5 | 0.015 | 37 of 200 |
| 3 | 0.000 | 0 of 200 |

So the option is not offered, and nothing the tool prints changes. The JHU check was planned to run only if the simulation passed, so it didn't run.

## Why, probably

This part is post hoc and decides nothing. The worst null series in both rounds is the Monday/Wednesday/Friday schedule. The check's cost model is a two-state chain: whether a day repeats depends on whether yesterday did. A fixed weekly schedule doesn't work that way. Whether a day repeats depends on which day of the week it is. The scan finds chance stretches where the chain's misfit lines up, and the penalty has to rise until it buries real two-month returns too. About 17 weekend days change from repeating to moving in a 60-day return to daily figures. That is plenty of evidence for a model that knows about weekends.

So the next round is a day-of-week repeat cost, one repeat probability per weekday in each stretch, pre-registered on the same cells. Full numbers: the README section ["Short returns to more frequent updates"](../../ventures/changepoint-detector/README.md).
