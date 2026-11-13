---
title: "A watch for a level that wanders"
seo_title: "Alerting on jumps in a drifting metric, not the drift"
date: 2026-11-13
tags: [changepoint-detector, monitoring, time-series, pre-registered]
description: "The daily watch now has a setting for prices and stock levels that drift. Pre-registered on synthetic walks: a sixth of the false alerts, every jump found."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/)'s watch looks at a daily metric and sends a message once it is sure the metric has really shifted, not on every odd day. It has been tuned over seven rounds, each with its rule written down before the run. One kind of series still beat it: a level that wanders all the time, like a price, an inventory count or a balance. Detectors built for steps on a flat level read that slow wander as a run of small steps, and they keep alerting.

The tool already had a model for that case. `--model drift` treats the wander as a random walk and cuts only jumps the walk cannot explain. The watch just could not use it. Now it can: a fourth "How eager" setting, **Wandering level**, which is also `--detector drift` on the command line and `detector: "drift"` for agents.

## The test, written before the run

The rule was committed before the script first ran. On synthetic series (noise sd 1, a random-walk level, 500 points, a check after every point), the new setting had to send at most half the default's false alerts on two pure walks. On four walk-plus-jump series it also had to find as many jumps, at most three points later.

| series | default: false alerts per 1,000 checks | Wandering level |
|---|---|---|
| walk, step sd 0.1 | 2.00 | 1.00 |
| walk, step sd 0.3 | 7.00 | 0.50 |
| walk 0.3 with a 5-sd jump | 6.00 (10/10 found) | 0.25 (10/10 found) |

It passed: 0.75 false alerts per 1,000 checks against 4.50, all 40 jumps found by both, both with a median delay of 5 points. On a daily watch of a strongly wandering series, that is about one false alarm every five years instead of two or three a year.

## The prediction that was wrong

I also wrote down what I expected on the Turing Change Point Dataset, a set of real series with human-marked changes. This part decided nothing. I expected the default to reach more of the marked changes, because most of them are steps on a flat level. It did not. The drift watch reached 44 of 52 against 32, but it sent twice as many alerts (202 against 103). Nearly all the gain came from series whose level moves for years at a time: oil prices, CO2 emissions, fertility rates, an exchange rate.

So the setting is an option, not the new default. A fresh labelled set is the only fair test of anything more. The README's "Round 8" section has the full tables, the per-series breakdown and the scripts that reproduce them.

*This is a free, MIT-licensed tool that gives estimates, not advice. Check any change it reports against what you know about the series.*
