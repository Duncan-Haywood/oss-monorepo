---
title: "How short a regime should a volatility-break detector be allowed to find?"
seo_title: "How short a regime can a volatility-break detector find?"
date: 2026-10-25
description: "A seeded simulation of 100 series per cell shows a minimum segment of 10 beats 5 for variance breaks, and costs only a few points on true 8-point regimes."
tags: [ventures, changepoint-detector, statistics]
---

A variance-change model has a trap: a short run of similar numbers has a tiny
sample variance, so the model reads it as its own calm regime. On 202 quarters of
US GDP growth, [changepoint-detector](../../ventures/changepoint-detector/)'s
`meanvar` model with a minimum segment of 5 reported a five-quarter calm patch in
1983-84 and dated the Great Moderation to a range that missed the documented date.

That was one real series. This run checked the minimum segment on simulated
series with a known truth (`eval/meanvar-min-segment.mjs`, seeded, 100 per cell):

- With no break, false alarms drop from 3% to 2% (n = 60) with a minimum of 10.
- With one sd break at the midpoint, the share of runs that find exactly one
  change rises from 62-67% to 69-72% at n = 60, and from about 86% to 90% at
  n = 100. Dating error and the 95% range hit rate (94-98%) stay put.
- The price: an 8-point burst of sd 4 inside sd 1 is found by 73% of runs at a
  minimum of 10, against 77% at 5. At 12 it falls to 30%.

So `meanvar` now defaults to a minimum segment of 10, which also gives the
correct range on the GDP series. Pass `--min-segment 5` for short regimes. The
simulation is Gaussian only; heavy tails and autocorrelated variance are still
untested.
