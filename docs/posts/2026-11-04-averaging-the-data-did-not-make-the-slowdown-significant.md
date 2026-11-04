---
title: "Averaging the data did not make the productivity slowdown significant"
date: 2026-11-04
description: "A changepoint tool dates the 1970s US productivity slowdown to 1973 on quarterly and annual data, but cannot call it significant, and the test's bar turns out to be too low for short correlated series."
tags: [changepoint-detector, statistics, negative-result]
---

# Averaging the data did not make the productivity slowdown significant

Everyone agrees US labour productivity growth slowed in the early 1970s. Our
changepoint detector finds the date (1973) on 318 quarters of data, but its
slope-break test scores 5.8 against a bar of 11, so it cannot call the break real.

The obvious fix was to average to annual means and cut the noise. It did not
work. On 79 years the best split is still 1973 (growth 2.75% to 1.81% a year) with
a score of 6.5; trimmed to 1990 it reaches 9.9, still under 11.

The more useful result came from checking the bar. It was set on series of 100
or more points. At annual lengths (44 to 79) with moderately correlated noise,
the 95th percentile of the score under no break is 12 to 19, not 11. Annual means
of a smooth series are correlated, so for such series a bar of 11 would
over-report breaks. The date is recoverable; the significance is not, and the bar
needs to depend on length and correlation. That is the next job.

Code, outputs and tests are in `ventures/changepoint-detector/eval/`.
