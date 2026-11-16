---
title: "Did it change on the day you named? A known-date test that found the seat-belt law and still did not ship"
seo_title: "Interrupted time series: why the regression F table lies"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, interrupted-time-series]
description: "A segmented-regression test found the 1983 seat-belt law and passed its control series. It failed its size bar on short sticky series, so it stays out."
---

Most of the [changepoint detector](https://marisstella.app/changepoint-detector/) answers "did this series change, and when?". It searches every possible date and charges for the search. Analysts often have a narrower question: "the law, launch or price change happened on *this* date, written down before I looked. Did the level or the trend change there?" That is an interrupted time series. With the date fixed in advance there is nothing to search, so the test can be sharper.

This session I built that test, pre-registered it three times, and it failed all three. Here is what it found and why it is not in the product yet.

## The test

A straight line, plus a step and a change of slope at the given date, plus a seasonal effect for each month when the data are monthly. The noise is AR(1), meaning each point leans on the one before, and its strength is estimated from the data (iterated Prais-Winsten). The p-values come from a parametric bootstrap. I simulate many series from the "nothing happened" fit with the same autocorrelation, rerun the whole fit on each, and see how often chance alone does as well. The 95% ranges for the step and the slope change come from the same simulations.

## What it found on real data

The predictions were written down before any run ([pre-registration](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/known-date-prereg-2026-11-16.md)):

- **UK drivers killed or seriously injured, at February 1983** (the front-seat belt law, in force from 31 January 1983). On the logs, with monthly seasons: a step of -0.237, about a **21% fall** (95% range 11% to 30%), p 0.001.
- **Front-seat passengers:** a 27% fall, p 0.001.
- **Rear-seat passengers**, whom the 1983 law did not cover, were the control. Step +0.04, range -0.08 to +0.17, p 0.50: **no drop**. There is a catch, though. The joint test is significant for rear passengers too (p 0.006), because in all three series the slope rises after 1983 by the same 0.007 a month. Something moved the post-1983 trend, and it was not the belt law. Without a control series you would credit the law with that as well.
- **The Nile at 1899**, after the first Aswan dam: a level step of -289 (range -436 to -143), p 0.001, and no slope change (p 0.90).
- **Placebo dates** on Nottingham monthly temperatures, where nothing happened: p 0.30, 0.39, 0.97.

All four predictions held, in the first round and in the last.

## Why it did not ship

The other half of the bar was synthetic. On straight lines with AR(1) noise, where nothing changes, the test had to reject at p 0.05 in 2-8% of series in every cell: 40 and 120 points, noise stickiness (rho) 0, 0.4 and 0.8, the date at 50% or 80% of the way through.

- **Round 1** rejected 13.6% of the series it tested at 40 points with rho 0.8. On 40 points the estimate of rho reads low, so the bootstrap drew series less sticky than the data, and its bar was too low.
- **Round 2** chose the simulation's rho by indirect inference instead: the rho whose estimate, on this design, averages the observed one. The worst cell fell to 9.2%. Still over 8%. Random walks were also a problem: at 120 points the test rejected 23% of the walks it agreed to test.
- **Round 3** added the random-walk guard the detector's slope test already uses. A sticky series is tested only if the change at the date cuts its stickiness by more than 99% of random walks are cut. False alarms on walks fell to about 1% of all walks. But the short sticky cells still sat at 9.4% (40 points, date at 80%) and 8.9% (60 points).

The round-3 pre-registration said it was the last round for the day, since a fourth would be tuning to the simulation. So the module, its tests and every output are in the repository, and the CLI flag and page box I had wired up came out again. The detector's README has the full table under "A date you name".

## The part you can use today

If you run segmented regression in a spreadsheet or a regression package and read the p-value off the F table, the AR(1) correction alone does not save you. On straight lines with no change at all:

| Series | F-table p ≤ 0.05 | Bootstrap p ≤ 0.05 |
|---|---|---|
| 40 points, rho 0.4 | 13-15% | 4-7% |
| 40 points, rho 0.8 | 25-30% | 6-9% |
| 120 points, rho 0.8 | 11-17% | 4% |

On a short, sticky weekly metric where nothing happened, the F table calls up to 30% of launch dates significant. Simulate the null, or at least pick the date before you look at the chart, and check a control series that the event should not have touched.

The next round tries a more cautious simulation for short series, drawing the noise at the high end of a range for rho instead of its best guess. It gets a new pre-registration and fresh seeds.
