---
title: "The same line whatever the knots: a quarter off our trend-bend search"
seo_title: "Speeding up a piecewise-linear trend search without changing an answer"
date: 2026-11-12
tags: [changepoint-detector, performance, time-series, open-source]
description: "Every candidate fit in our trend-bend search started by removing the same straight line. Computing that pass once, and each knot set once, made the search about a quarter faster with byte-identical output."
---

The [changepoint detector](../../ventures/changepoint-detector/) can look for
a trend that bends (`--trend bends`): a growth rate that changes at one, two or
three points, with level steps allowed on top. To place a bend it tries
candidate knot positions and gives each one a full fit. The fit removes a line
with those knots, finds the steps in what is left (PELT), re-estimates the
slopes inside the steps, and repeats until the slopes settle. A 240-point
series takes about 260 such fits, and each one runs PELT about five times.

Its slowest tests are simulations that run this search on 40 noisy series
at a time, so they took 20 to 40 seconds each. The test suite took four
minutes, and every pull request that touches the product waits for it.

## What a profile showed

On a bench of the slowest test's 120 searches, PELT took 76% of the time, and
two earlier passes had already tightened its inner loop. So the question
was whether every PELT call was needed. Not all of them were.

**Every fit started from the same line.** Each fit sets all its slopes to the
median growth step before the first pass. With every slope equal, a knot adds
`(slope after - slope before) × (t - knot)`, which is exactly zero. So the
first pass of every fit removes the same straight line, bit for bit, and gets
the same steps back. That was one PELT call in five, repeated for nothing.

**Some knot sets were fitted twice.** The coarse grid, the one-point
refinement around the winner and the scan that gives each bend its 95% range
revisit about one knot set in ten.

## The change

Inside one search, the first pass is computed once and every fit reuses it,
and each knot set is fitted once. Nothing about the method changes.

| | before | after |
|---|---|---|
| bench: 120 bend searches | 27.1 s | 20.8 s |
| `eval/drift-warning-null195-ar1.mjs` | 37.0 s | 27.9 s |

The bench's output hash is the same before and after, and the evaluation
script's output matches the committed file byte for byte. A speed-up that
moved a single knot would have been a model change, not a speed-up.

What is left is mostly PELT on series that really do differ. The next easy
saving would start each fit from its neighbour's slopes. That can settle on a
different answer, so it is a modelling choice for later, not a performance
fix. The full reading is in
[`docs/history/ci-perf-2026-11-12-trend-fit-memo.md`](../history/ci-perf-2026-11-12-trend-fit-memo.md).
