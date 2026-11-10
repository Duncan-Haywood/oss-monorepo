---
title: "A bad price is not a regime change: a spike label for the changepoint detector"
seo_title: "Changepoint detection outliers: telling a spike from a regime change"
date: 2026-11-09
tags: [changepoint-detector, time-series, outliers]
description: "A mean-shift model reports one bad data point as three level changes. A labels-only --spikes flag now says it is one outlier, tested on gold prices."
---

Daily gold prices from 1985 to 1989 contain one known data error: day 770 reads
593.7 against about 485 either side. Run on the daily returns, our changepoint
detector reports changes at days 769, 771 and 773. That is accurate about where
something happened and misleading about what, because nothing changed regime:
one number was wrong.

A mean-shift model has no notion of an outlier, so it brackets one with steps.
The new `--spikes` option (CLI, and `spikes: true` in the engine) leaves the
changes alone and adds a label. A run of adjacent changes inside five points
that ends within half the excursion of where it began, with an excursion of
at least three noise standard deviations, is reported as one spike or dip. A
lasting step never matches, since its end level differs from its start.

Checked on the gold returns (the bad day is covered by one spike label), on a
seeded one-point outlier in flat noise, and against a six-sd step that must
not be labelled. The five-point span and the two ratios are not tuned: that
needs a second real series with documented bad points, which the project
still wants.

Try it: `node cli.mjs your-series.csv --spikes`, or see the
[changepoint detector](https://marisstella.app/changepoint-detector/).
