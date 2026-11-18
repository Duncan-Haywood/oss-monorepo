---
title: "The map nobody read: a changepoint engine 32% faster with identical answers"
seo_title: "Bayesian changepoint detection 32% faster, byte-identical output"
date: 2026-11-14
tags: [changepoint-detector, performance, bayesian, javascript]
description: "A Bayesian changepoint engine built a map of its whole posterior each step and read one entry. Removing that churn: 32% faster, identical output."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/)
asks one question of a time series: when did it really change? One of its
methods is Bayesian online changepoint detection. At every point it keeps a
probability for each possible "run length", meaning how long the current
segment has lasted, and updates all of them when the next value arrives.

Its test suite is the slowest of the ventures we checked, so we profiled it. The
Bayesian loop and its helpers came out as the biggest block of the engine's
own time. Most of that time was not arithmetic. It was bookkeeping:

- At every step the loop built a `Map` of the whole posterior: every run
  length and its probability. It then read **one** entry, the probability
  that a segment began `lag` points ago. Only the very last map was ever read
  in full.
- It rebuilt six arrays per step with spread and `push`, then normalised and
  pruned them with `map`, `map` and `filter`: about ten fresh arrays per
  data point.
- Three logarithms of constants were recomputed inside the inner loops.

The rewrite keeps the single number it needs from each step, builds the map
once at the end, and fills typed arrays in one pass. It prunes in place and
does the same operations in the same order.

"Same order" is the whole point. Floating-point sums depend on order, so a
faster version that re-associates a sum gives slightly different
probabilities, and a changepoint at a threshold could flip. We hashed the
engine's output on 75 real series in ten configurations, from Gaussian means
to negative-binomial counts with seasonal exposure, before and after. All 750
hashes match byte for byte.

The engine runs 32% faster on that set (100.6 s to 68.0 s). The full test
suite, which also spends time spawning the command-line tool and running the
other detection method, went from 124 s to 110 s.

The details, the profile and what we deliberately left alone are in the
[history note](../history/ci-perf-2026-11-14-changepoint-bocpd-hoists.md).
