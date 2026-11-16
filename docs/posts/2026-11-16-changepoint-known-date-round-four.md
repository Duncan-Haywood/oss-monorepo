---
title: "Testing a date you name: the fix that made the test too cautious"
seo_title: "Interrupted time series on short, sticky data: a fourth round"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, interrupted-time-series]
description: "A bootstrap at an upper bound for autocorrelation removed every over-eager cell of a known-date test, then fell under its 2% floor in one. Not shipped."
---

Most of the [changepoint detector](https://marisstella.app/changepoint-detector/) searches for the dates a series changed. A different question comes up just as often: a law, a launch or a price change happened on a date you wrote down before looking at the chart. Did the level or the slope change there? That is an interrupted time series. The standard tool is segmented regression: a line, a step at the date and a change of slope after it.

The hard part is the noise. Monthly sales, weekly sign-ups and yearly river flows are sticky: each point is a lot like the one before. The textbook F test treats that stickiness as fresh evidence. In our simulations of straight lines with no change at all, it "found" a change in 11 to 30% of sticky series at the 5% level.

## Three rounds that were too eager

The module fits AR(1) noise and calibrates its p-values with a bootstrap: it simulates many straight lines with the same stickiness, fits each one the same way and sees how often the real statistic is beaten. Before any of this could ship, I wrote down a bar: at the 5% level, the share of no-change series it flags must lie between 2% and 8% in every simulated setting. It also had to make four predictions on real data, such as the 1983 UK seat-belt law.

Three rounds failed on the same weak spot: 40-point series with strong stickiness (rho 0.8), where it flagged 9 to 14%. A short series understates its own stickiness, so the bootstrap simulated tamer noise than the data really had.

## Round four: simulate the worst plausible case too

The fourth round, pre-registered before the confirmatory run, added one step. It works out an upper bound for the stickiness, the highest value the data do not rule out at 90%. It then runs a second bootstrap at that value and keeps the larger p-value. This is a small version of a known idea: when a nuisance parameter is uncertain, take the worst case over a range of values that fits the data.

On 400 fresh simulated series per setting:

- **The over-eager cells are gone.** The worst setting flagged 5.9%, against 9.4% in round three. Even the near-unit-root case at 60 points (rho 0.9), which round three flagged at 24.5%, dropped to 7.3%.
- **Random walks are still turned away.** At most 1.0% of them got through the guard and were then flagged.
- **The real predictions still hold.** Drivers killed or seriously injured fell about 21% at the 1983 seat-belt law (p 0.001). Rear-seat passengers, whom the law did not cover, show no step (p 0.50). The Nile drops by 289 units after the 1898 Aswan dam. Three placebo dates on Nottingham temperatures give nothing.
- **It is now too cautious in one place.** With 40 points, moderate stickiness (rho 0.4) and the date at 80% of the series, it flagged 1.8% of no-change series. The floor was 2%.

## Why the floor matters

A test that flags less than its nominal 5% sounds safe, and in a sense it is. The cost shows up as power. On 40-point series with rho 0.4, a step as large as the noise was found 4.8% of the time. That is less often than the test flags series with no step at all. Forty points say little about stickiness, so the upper bound sits far above the truth, and taking the larger p-value spends the whole error budget on a worst case that rarely holds. On 120-point series the power is close to round three's: 63% for the same step with no stickiness.

By its own pre-registration, the test does not ship. The CLI option, `--known-date`, was written and then taken out again.

## What comes next

The next round will apply the upper bound only where round three failed: series whose stickiness about a plain line is above a value fixed in advance. The alternative is a Berger-Boos p-value, a maximum over a narrower range of stickiness values plus a small correction for the range. Either way, the 2% floor will apply to every setting again, with fresh seeds.

The full tables, the four pre-registrations and the code are in the [changepoint detector's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) under "A date you name".
