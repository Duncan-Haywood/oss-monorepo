---
title: "Passing every simulation and missing on real data: a feed check reads weekday schedule changes as returns"
seo_title: "Short returns to daily reporting: simulations pass, real data fails"
date: 2026-11-18
tags: [changepoint-detection, statistics, data-quality, negative-result]
description: "Choosing a weekday or chain model per stretch finds 200 of 200 simulated returns with no false alarms, but dates only 3 of 8 documented real ones."
---

[Round 3](2026-11-18-changepoint-weekday-cost-short-returns.md) of the [changepoint detector](../../ventures/changepoint-detector/README.md)'s short-return scan left two half-answers. The plain weekday cost found nearly every simulated two-month return to daily reporting, but on feeds that repeat in clumps it raised false returns. The weekday chain kept the false alarms down but missed too many returns. The obvious next step was to pick the model per stretch: use the weekday cost only where the stretch actually looks weekly.

## The test, fixed before it ran

A stretch counts as weekly when a two-state chain per weekday (14 parameters) beats a single two-state chain (2 parameters) by more than the 0.999 quantile of chi-square on 12 degrees of freedom, 32.9. The baseline is a chain, not a coin, so a feed that repeats in clumps can't pass as a schedule just because its repeats bunch up. The threshold, the cells, the bars and the real-data check were all [committed](../../ventures/changepoint-detector/eval/update-rate-returns-auto.mjs) before any series ran.

## Simulations: every bar passed

| fresh confirmation seed | chosen per stretch, m 3 | weekday cost alone, m 3 |
|---|---|---|
| worst false returns a series | **0.000** | 0.590 |
| 60-day returns found | **200 of 200** | 200 of 200 |
| 30-day returns found | 167 of 200 | 167 of 200 |

The test sorted the cells cleanly. Every weekly-schedule stretch read as weekly, and at most 0.5% of the clumpy-chain stretches did. Round 2's chain had found 0 of these 60-day returns.

## Real data: 3 of 8, the bar was 4

The plan said that if the simulations passed, the check would run on Johns Hopkins' eight documented returns to more frequent COVID-19 reporting. It dated Idaho, Vermont and Michigan. It missed Arkansas, Alaska, Nebraska and South Dakota, and it put Alabama's return two months early. So the pass is not offered, and nothing the tool prints changes.

The miss is the useful part. Five of the twelve "returns" it found across the 27 states have the same repeat share inside as around them, 85% against 85%. Those aren't returns to more frequent publication. The state changed *which* days it published. The weekday cost gains from any change in the weekly pattern, and none of the simulated null series moved publication to a different set of days of the same size. The calibration never got the chance to see this.

Next round: add a null cell that keeps the number of publication days and moves them, and require a real drop in repeats, both fixed before it runs. The Johns Hopkins check has now been seen twice, so it can confirm a result but can't be used to choose one.

Full tables: the README section ["Short returns: the model chosen per stretch"](../../ventures/changepoint-detector/README.md).
