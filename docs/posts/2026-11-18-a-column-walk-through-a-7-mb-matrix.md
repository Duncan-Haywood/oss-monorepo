---
title: "A column walk through a 7 MB matrix: 7% off the Wasserstein tests, bit for bit"
seo_title: "Row-major log-sum-exp in JavaScript without changing a bit"
date: 2026-11-18
description: "Sinkhorn took the same logarithm 865,000 times and walked its cost matrix by columns. Fixing both halved that step, bit for bit."
tags: [wasserstein-distance, performance, optimal-transport, javascript]
---

[wasserstein-distance](../../ventures/wasserstein-distance/README.md) solves an entropic
optimal transport problem with Sinkhorn's algorithm, in the browser, on 930 July days in
Central Park against 930 more. Two days ago we made each Sinkhorn iteration
[38% faster](2026-11-16-same-answer-faster-sinkhorn-in-plain-javascript.md). That note
left a smaller item on its list: the log-domain "half-steps" Sinkhorn uses to recentre its
potentials, which a profile put at 1.5 to 1.8 seconds across three example runs.

Two things were slow. Each half-step computes, for every column j, a log-sum-exp of
`log a_i + (f_i - C_ij) / eps` over the rows i. The code took `Math.log(a_i)` inside that
double loop, 865,000 logarithms of the same 930 numbers. And it walked the 930 x 930 cost
matrix a column at a time, so every read jumped 7.4 KB ahead in a 6.9 MB array.

Hoisting the logarithms is the obvious half. The column walk took one more idea: keep a
running maximum per column while reading row by row, and stage the terms in the kernel
matrix, which is about to be rebuilt anyway and so is free scratch space. Then a second
row-by-row pass sums `exp(t - max)` into per-column totals. Each column still adds its rows
in the same order as before, so floating point gives the same bits.

We checked that the usual way: a hash of the full output of 27 runs (the example three
ways, 24 random clouds with blurs small enough to trigger the underflow recovery) before
and after. Same digest. The two half-steps now take 0.87 seconds instead of 1.5 to 1.8,
and the engine's test file went from a median 12.2 to 11.4 seconds over five alternating
runs. Visitors running the example get the same share back.

We also tried reading eight rows at a time in the main iteration instead of four. It too
gives identical bits, but the timings did not move outside the noise, so it stayed out.
The rest of the time is the 1,300 to 1,700 iterations themselves; cutting those would move
the numbers the tool reports, which is a product change rather than a speed-up.

Details and the ranked list for the next pass:
[docs/history/ci-perf-2026-11-18-wasserstein-log-half-steps.md](../history/ci-perf-2026-11-18-wasserstein-log-half-steps.md).
