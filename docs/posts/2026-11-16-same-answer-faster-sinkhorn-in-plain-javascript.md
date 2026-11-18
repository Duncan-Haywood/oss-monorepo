---
title: "Same answer, 38% faster: Sinkhorn in plain JavaScript, four rows at a time"
seo_title: "Speeding up Sinkhorn optimal transport in JavaScript, bit for bit"
date: 2026-11-16
description: "The Wasserstein distance tool spent most of its time in two matrix-vector products. Reading the kernel four rows at a time cut 38% without changing a bit."
tags: [wasserstein-distance, performance, optimal-transport, javascript]
---

[wasserstein-distance](../../ventures/wasserstein-distance/README.md) compares two groups
of numbers by how much "earth" you would have to move to turn one distribution into the
other. Its bundled example compares July nights in Central Park, 1951-1980 against
1991-2020, at 930 days each. With more than one column it solves an entropic optimal
transport problem with Sinkhorn's algorithm, in the browser, and reports a bracket that is
proven to contain the exact distance.

The test file that checks this took 17 seconds, and a profile put 7.3 of about 9.4 seconds
of two example runs in one function. Each Sinkhorn iteration is two matrix-vector products
with a 930 x 930 kernel: column sums `K^T u`, then row dot products `K v`. The two runs
need 2,110 iterations between them, so a product cost about 1.6 nanoseconds per
multiply-add.

## What did not help

The first idea was memory: the iteration read the 6.9 MB kernel two or three times. We
fused it into one pass that computes row i's dot product, its new scaling factor, and its
share of the next column sums while the row is still in cache. It made no measurable
difference. The loop was limited by arithmetic and loads, not by memory bandwidth.

## What did

The fix was to handle four rows at a time. The four dot products share each load of
`v[j]`, and the column sum is updated once per four rows instead of once per row:

```js
Ku[j] = Ku[j] + K[r0 + j] * u0 + K[r1 + j] * u1 + K[r2 + j] * u2 + K[r3 + j] * u3;
```

JavaScript adds left to right, so this is the same sequence of floating-point additions
as four separate `+=` lines. That matters. We wanted the same answer, not one that is
merely close. We hashed the full result of 16 runs before and after (the example under four
settings, plus random point clouds of three sizes), and every hash matched, iteration
counts included.

## The numbers

- The engine's test file: 17.4 s to 10.8 s.
- Loading the example on the page with default settings: 4.2 s to 3.1 s, with the same
  distance and the same 1,340 iterations.

What is left is the number of iterations. A faster-converging variant would change the
reported bracket in its last digits, so it would be a product decision, not a speed-up.
The details and a ranked list of what we did not change are in
[the run's note](../history/ci-perf-2026-11-16-wasserstein-sinkhorn-fused-rows.md).
