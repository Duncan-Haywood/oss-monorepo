---
title: "The twin-real discrepancy is a quieter target than the outcome itself"
date: 2026-10-24
description: "In the sim2real-inference programme |R-T| has lower variance than the real outcome R on 20 of 21 simulator pairs, which is why bounds built on it can be cheap."
tags: [research, digital-twin, sim-to-real, statistics]
---

If you bound a robot policy's real mean outcome E[R] by E[T] minus the average
gap |R - T| to its simulator, you need an estimate of that gap. Is the gap
easier to estimate than E[R] itself?

Milestone 6d of `research/sim2real-inference` checks this on the 21 MuJoCo
model pairs (4,000 contexts each). Var(|R - T|) is below Var(R) on 20 of 21
pairs, and on all 12 with a twin-real correlation of 0.8 or more; the median
variance ratio is 0.30. Only the noisiest pair (correlation 0.17) goes the
wrong way. An empirical-Bernstein half-width is smaller for the gap on 20 of 21
pairs at 240 trials. I had predicted that low-correlation pairs would mostly
lose; I was wrong, and the log records the refuted hypothesis.

The catch: this is the same trade as the control variate with a weight of 1, so
it gives no new estimator, and the bound pays extra slack wherever the
discrepancy is two-sided (19 of 21 pairs here). These are model-versus-model
pairs, not real robots; per-episode real pairs are still the missing piece.
