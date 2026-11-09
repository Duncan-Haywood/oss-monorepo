---
title: "Does giving a changepoint detector the cycle length stop it cutting the lynx cycle into steps?"
seo_title: "Changepoint detection on a 10-year lynx cycle: the period option"
date: 2026-11-09
tags: [changepoint-detector, time-series, negative-result]
description: "On 114 years of Canadian lynx trappings the default finds 23 false steps; setting the period leaves 10 to 24."
---

The changepoint-detector tells you, when it sees a cycle in the residuals,
to "give the period with `--period`". Nobody had checked that advice on a
cycle that is not a calendar one.

The test series is the Canadian lynx trappings, 1821 to 1934. It has a cycle
of about ten years and no documented step, so every cut is a false alarm. The
default model cuts it 23 times.

I swept the period from 8 to 12 years, with and without logs, and once with a
drifting seasonal shape. The step counts ranged from 10 to 24. The best case
(logs, period 12) still cuts ten times; none of the 11 settings reached zero.
The cycle's length varies and its peaks differ several-fold, so a fixed
profile can't absorb it.

What does work is `--ar1`, which finds no steps, by treating the cycle as
autocorrelation. The hint in the warning is right for months and weekdays and
weak for wildlife and sunspots. One series, one run; sunspots weren't rerun
with a period. Numbers: `ventures/changepoint-detector/eval/lynx-period.out.txt`.
