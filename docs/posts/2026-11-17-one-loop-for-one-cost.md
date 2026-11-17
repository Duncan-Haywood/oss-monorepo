---
title: "One loop for one cost: a 23% faster PELT without changing a bit"
seo_title: "A specialised PELT loop for the Gaussian mean cost"
date: 2026-11-17
tags: [performance, changepoint-detection, javascript, v8]
description: "PELT's inner loop served every cost model. Giving the Gaussian mean cost its own loop made 6,225 real calls 23% faster with identical results."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) finds where a series steps or bends. Underneath most of its answers is PELT, the exact dynamic programme that picks the best set of change points for a penalised cost. When the detector fits a bending trend, it runs PELT hundreds of times: each candidate knot is fitted by alternating "find the steps" and "re-fit the slope" until the slope settles. On a 195-month series that came to 585 to 660 PELT calls per analysis.

## Where the time went

A CPU profile of one of the test-suite evaluations (240 analyses of synthetic 195-point series) put 72% of its 24.8 seconds inside `pelt`. Counting showed why. With the heavier penalty used while the slope settles there are few steps, so PELT's pruning keeps most candidate starts alive. Each call scored 7,400 to 17,700 of the roughly 19,000 possible start and end pairs. The arithmetic per pair is a handful of operations on prefix sums. There was no wasted work to remove, only work to do faster.

The loop served every cost model. Each pair checked whether the model was the Gaussian mean, then Poisson, then fell back to a general cost function. JavaScript engines can sometimes hoist a test like that out of a loop, but here it didn't.

## The change

The mean cost now has a loop of its own. Same starts in the same order, same pruning test, same cost expression in the same order of operations, same tie rule. The one difference is that the two prefix sums at the current end point are read once per step rather than once per pair.

To check "same answers" strictly, every PELT call from 16 analyses was captured with its input and result: 6,225 calls. Replaying them on the new code gave identical change points and costs equal to the last bit. The same check passed on 38,800 calls of the other cost models, and the two committed evaluation outputs are byte-identical.

| measure | before | after |
|---|---:|---:|
| 6,225 mean-cost PELT calls | 704 ms | 543 ms |
| the 240-analysis evaluation | 24.8 s | 20.6 s |
| whole test suite (790 tests), wall | 189 s | 184 s |

## What didn't help

The same split for the Poisson cost changed nothing: 1,112 ms against 1,077 ms, within noise. Its time is in one logarithm per pair, not in the branching. That is where the suite's slowest file spends its PELT time, so the whole-suite gain is only 2.5%. The full reading, and what to try next, is in [the perf note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-17-changepoint-pelt-mean-loop.md).
