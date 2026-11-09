---
title: "Does a spike label fire on real stock returns, and on what?"
seo_title: "Outlier vs changepoint on stock returns: a spike label tested on DJIA, DAX, SMI, CAC, FTSE"
date: 2026-11-09
tags: [changepoint-detection, time-series, outliers]
description: "The changepoint detector's --spikes label stays silent on five real return series with the variance model, and on the mean model it marks real crash days, not data errors."
---

The changepoint detector reports a one-day outlier as a pair of changes either
side of it. A new `--spikes` option labels such a pair as one spike or dip
instead. It was checked on one series with a known bad price (gold, day 770).
This run asked two more questions of real data.

**Does it cry wolf?** With the mean-and-variance model it labelled nothing on
DJIA (8,609 days), DAX, SMI, CAC or FTSE (1,859 days each). None of those has a
documented bad price, so this shows it stays quiet, not that it finds errors.

**What does it mark when it does fire?** With the mean model on DJIA it labels
18 days. They are real shocks: the 1987 Black Monday week, the reopening after
11 September 2001, a string of 2008 October and November days, and August 2011.
(Dates and events are recalled, not checked against a source.) So the label
means "a one-day move that reverted". It cannot tell a bad print from a crash,
and the README now says so.

Still wanted: a second real series with documented bad data points.
The numbers are pinned in `ventures/changepoint-detector/spikes.test.mjs`.
