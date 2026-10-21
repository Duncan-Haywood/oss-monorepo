---
title: "Why changepoint detectors cry wolf"
date: 2026-10-21
description: "Sticky noise, seasons, trends and clumpy counts each make a changepoint method report shifts that never happened. How often, measured, and the fix for each."
post: why-changepoint-detectors-cry-wolf
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

You have a chart. Latency, sales, a sensor reading. Something changed after the release, or the price rise, or the day the sensor moved. And you want to know: did the level really change, or is that just noise?

A changepoint method answers that properly. It checks every possible split point in the series, and it charges a penalty for each extra segment it adds. So it isn't fooled the way you are when you pick a date from the chart and compare the averages before and after.

But the textbook methods lean on two assumptions. The noise around each level is independent. And the level is flat between changes. Real series rarely behave that way. And when they don't, the detector doesn't go quiet. It reports changes that never happened.

The repository has a changepoint detector that runs in the browser. It uses two methods: PELT, and Bayesian online changepoint detection. AI coding agents measured each trap on seeded synthetic series, forty runs per case, and added an option for each one. Here are the four traps.

First, sticky noise. Many series have memory. Today's latency looks like yesterday's. A method that expects independent noise reads a slow wander as a staircase of steps. On three hundred points of sticky noise with no change at all, PELT reported a false change in forty of forty runs. With the autocorrelation option switched on, that fell to four of forty. The Bayesian method went from forty of forty to zero.

The fix has a price. It loses some power. A big real shift was still found, in thirty-five of forty runs, but a small one is harder to see.

Second, a seasonal cycle. A weekly or yearly rhythm swings the series up and down, and each swing looks like a step. A real shift of four, hidden under a big sine wave, was reported as exactly one change in none of forty runs without adjustment. Telling the tool the period, so it subtracts the seasonal pattern first, raised that to thirty-three of forty. It needs at least two full cycles of data.

Third, a trend. A series that climbs steadily has no changepoint, but a flat-level model can only describe a ramp as a staircase. On plain ramps with no change, the flat model reported five and a half changes per series. A model with a straight line in each segment reported about one in seven.

Fourth, clumpy counts. Orders, incidents and visits per day are counts, and the usual Poisson model assumes the variance equals the mean. Real counts are often clumpier. On flat counts with a wobbling rate, the Poisson cost reported three and a half false changes per series. A negative binomial cost cut that to about a tenth of one. A real one-point-eight times step was still found in thirty-nine of forty runs.

There's a catch there too. When the clumping is also sticky, a busy day predicting another busy day, the negative binomial no longer helps, because it still treats counts as independent.

So what should you do with a chart and a question? Before believing a detected change, ask whether your series has memory, a cycle, a trend, or clumpy counts. If it does, switch on the matching option. Each fix has a measured cost, which is why none of them is on by default. A change that both methods agree on, and that survives the right correction, is good evidence. A change only your eye sees usually is not.

And remember what a changepoint tells you. It says when the data changed. Whether your release caused it is a separate question, and only you can answer it.

All of these figures come from seeded synthetic series in the tool's test suite, not from anyone's real data. This is statistical analysis, not advice. The numbers, the seeds and a plain-language guide are in the blog post of the same name. Thanks for listening.
