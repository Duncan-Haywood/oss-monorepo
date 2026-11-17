---
title: "The cycle check that cost more than finding the steps"
seo_title: "Fisher's g periodogram test 11x faster in JavaScript, same answers"
date: 2026-11-15
tags: [perf, changepoint-detector, javascript, signal-processing]
description: "One periodogram check took 679 ms on an 8,609-day series. A one-period trig table cut the whole analysis from 1.56 s to 0.92 s, same answers."
---

After the [changepoint detector](/changepoint-detector/) finds the steps in a
series, it runs one more check. It takes what is left over (the residuals
about the steps) and asks whether they still carry a cycle. If they do, some of
those "steps" are probably a seasonal or business cycle read as regime
changes, and the page says so. The test is Fisher's g: the largest share of
the periodogram, with an exact p-value.

The periodogram was written the textbook way. For every frequency k and every
point t, it computed `Math.cos(2πkt/n)` and `Math.sin(2πkt/n)`. That is n²/2
trig calls per series. At 240 monthly points nobody notices. On 8,609 daily
Dow Jones returns it took **679 ms**, a large share of the 1.56 s the whole
analysis took.

## One table of n values

The cosine of 2πkt/n depends only on kt mod n, so there are only n distinct
values. We now build them once, `cos(2πj/n)` for j < n, and walk the table with
an index that steps by k and wraps at n. The sums run in the same order as
before.

The values are not bit-for-bit the same. The old angle, 2πkt/n, picked up a
rounding error that grew with kt, while the table's angle is exact in the
integer. So we checked the answers rather than the bits:

- On 3,206 series (every column of the 81 real datasets in the repository, their
  residuals, and 3,000 synthetic ones from 60 to 9,060 points), the peak
  frequency was the same every time. g moved by at most 4.5 parts in 10¹³.
  No cycle warning appeared, disappeared or changed its wording.
- The full analysis output (every number on the page) was byte-identical on
  all 243 runs over the real datasets.

## What it bought

| | before | after |
|---|---:|---:|
| periodogram, 3,206 series | 29.6 s | 2.5 s |
| full analysis, DJIA (8,609 days) | 1.56 s | 0.92 s |

The test suite gets about 2 s back in each of the two files with long series.
The bigger win is in the browser: anyone pasting a long daily series waits 41%
less. As in our [earlier passes](/posts/2026-10-20-we-almost-rewrote-it-in-rust/),
the cost was in the algorithm, not the language.

The notes, with what we measured and left alone, are in
`docs/history/ci-perf-2026-11-15-changepoint-fisher-table.md`.
