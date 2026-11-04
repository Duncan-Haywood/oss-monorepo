---
title: "A significance bar that knows how long your series is"
date: 2026-11-04
description: "The slope-break test now simulates its threshold from series length and serial correlation; the US productivity slowdown is still not significant."
tags: [changepoint-detector, statistics]
---

# A significance bar that knows how long your series is

The slope-break test in the changepoint detector asked whether the growth rate of
a series changed. Its threshold was a fixed 11, calibrated for 100+ points. On a 44-year
annual series with some serial correlation, nulls with no break at all cleared 11 in
11.7% of 300 trials, more than twice the 5% the bar claims.

`slopeBreakPValue` replaces the constant with a simulated bar: estimate the
lag-1 correlation, draw seeded AR(1) nulls of the same length, and report where the
observed statistic falls. On 300 null series per cell it rejects 4 to 5% at n=79 and
n=200, whatever the correlation. At n=44 it improves (11.7% to 7.7%) but is not
fixed: the correlation estimate itself is biased low in short series. We say so in the README.

The real-data answer did not change. US labour productivity's 1973 slowdown is
recovered as the best split date, but the p-value is 0.17 on quarterly data and 0.15
on annual means. Growth fell from 2.8% to 1.8% a year, and the data still can't
separate that from noise at this test's power (about 46% at n=79 for a drop of 1.0 to 0.2).

Code and numbers: `ventures/changepoint-detector/` (`slope-breaks.mjs`, `eval/slope-pvalue.mjs`).
