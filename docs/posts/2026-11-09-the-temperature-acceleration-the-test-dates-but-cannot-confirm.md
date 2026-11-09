---
title: "The 1976 warming acceleration: our break test finds the year but cannot confirm it"
seo_title: "Slope break test on global temperature 1880-2024: 1976 found, not significant"
date: 2026-11-09
tags: [changepoint-detector, negative-result, climate-data]
description: "On 145 years of global temperature, the best slope split is 1976, but the test statistic is 1.8 against a bar of 8.4 (p 0.80)."
---

The changepoint-detector's slope-break test asks whether the growth rate of a
drifting series changed. It had been run on US GDP and US productivity, where
it dated the recalled 1970s slowdown correctly and could not confirm it.
The open item was a series with a documented break and a test that could
pass, so today it ran on annual global temperature, 1880 to 2024.

**Result.** The best single split is 1976, the year the literature gives for
the acceleration. In the windows 1910-2024 and 1930-2024 it is 1976 again.
But the statistic W is 1.8 against a bar of 8.4 (n=145, lag-1 autocorrelation
of the differences -0.20), and a Monte Carlo p-value is 0.80. Nothing is
reported.

**Why.** Year-to-year changes in temperature are noisy, about a tenth of a
degree, while the slope change is a few hundredths of a degree a year. A
test on the differences throws away the level fit's information, so it has
little power here. The bend model (`--trend bends`) dates 1913 instead. No
model in the tool both dates and tests 1976.

The 1976 date is recalled, not read from a source in this run. The script,
output and a test that pins it are in `ventures/changepoint-detector/eval/slope-global-temp.mjs`.
