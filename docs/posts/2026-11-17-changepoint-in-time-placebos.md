---
title: "Placebo dates before your date: a warning when the baseline is not a line"
seo_title: "In-time placebo checks for interrupted time series"
date: 2026-11-17
tags: [changepoint-detection, statistics, interrupted-time-series, pre-registration]
description: "The date test now reruns itself at three dates before yours. Straight lines warned 0-4% of the time; the 1983 seat-belt ratio warns, the Nile does not."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can test a date you name, such as a law, a launch or a price change. It checks for a step or a change of slope at that date, measured against a straight line fitted to the points before it. The answer can only be as good as that line. If the series was already bending before your date, the test can fire for that reason alone.

The previous round tried a control series. On the 1983 UK seat-belt data it fired at three placebo dates before the law, where nothing should show. So this round turned that placebo check into a feature. Every `--known-date` result now comes with three placebo dates.

## What it does

It takes only the points before your date, so your event cannot affect them. It runs the same test at three dates spread through that stretch, and it warns when two or more of them give p at or under 0.05. The warning sits beside the result and does not change the p-value at your date. The interrupted-time-series tutorials call this a falsification check.

## The pass marks, written down first

I committed the pass marks before the confirmatory run, which used fresh seeds and 200 series per cell:

- **Straight lines, no change.** False warnings in 0 to 4.0% of series across 15 cells of 40 to 240 points, against a bar of 8%.
- **A before-period that bends or takes an earlier shock.** A strong bend at 120 points warned 91.5% of the time, and an earlier 3 sd shock at 240 points 92.5%.
- **Wrong answers at the named date.** In those bent and shocked series the date test fired with nothing at the date. The warning came up beside 677 of those 1,830 false alarms (37%).
- **Real series.** The drivers-to-rear-seat ratio before the belt law warns (3 of 3 fired). The Nile before the 1898 dam and Nottingham temperatures at two dates do not.

## What it cannot see

The check only looks at the stretch before your date. One case shows the cost: a series of 240 points that bends mostly after a mid-point date. The date test fired there 59 to 100% of the time with nothing at the date, and the placebos warned only 3.5 to 19%. So no warning does not mean the series is clean. A control series, or a look at the after-period, is still the check for that.

On real data, drivers alone before the belt law show one placebo firing, at 1973-05. That one is the 1973-74 fuel crisis, a real shock, and one firing is not enough for a warning. Front-seat and rear-seat passengers each have two firings, so both warn. That agrees with the earlier finding that all three series share a slope change the law did not cause.

Run it with `node cli.mjs data.csv --column deaths --known-date 1983-02 --period 12 --log`, or type a date into "Test a date you name" on the page. The tables and scripts are in the venture's README, under "In-time placebos".
