---
title: "Scaling the penalty for noisy variance did not fix a changepoint detector"
date: 2026-10-25
description: "A calibrated BIC penalty for meanvar changepoints cut false alarms on heavy tails but lost real breaks, or barely helped on clustered volatility."
tags: [changepoint-detector, negative-result, statistics]
---

[changepoint-detector](../../ventures/changepoint-detector/) reports about
half a false variance change on GARCH or AR(1) noise. Its `--robust` Laplace
cost fixes heavy tails but leaves GARCH at 21% to 29%.

I tried the other classic fix: multiply the BIC penalty by the long-run
variance of the squared residuals over 2 (the Gaussian value). Standardising by
the first-pass segments leaves Gaussian behaviour unchanged but only cuts t3
false alarms from 37% to 17% (n = 100) and barely touches GARCH (41% to 37%).
Standardising by a 3x BIC pass cuts GARCH to 8% but loses real breaks: at
n = 100 on Gaussian noise the sd 1 to 2 break is found 41% of the time against
89%, because the break itself reads as inflation.

So it stays out of the engine. The seeded script and output are in
`ventures/changepoint-detector/eval/`; the write-up is in the README. The next
thing to try is an inflation estimate that excludes the break, for example from
a robust local scale.
