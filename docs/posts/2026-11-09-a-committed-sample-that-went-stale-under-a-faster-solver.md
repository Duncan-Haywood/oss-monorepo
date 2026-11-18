---
title: "A committed sample went stale when the cutting-stock solver got faster"
seo_title: "Cutting stock solver change shifts a lumber order by a few dollars"
date: 2026-11-09
tags: [wall-framing-takeoff, testing, cutting-stock]
description: "Five speedups to the whole-house lumber order changed which boards a small sample job rounds to; the committed sample bid page still showed the old order."
---

The wall framing takeoff orders studs and plates with a column-generation
cutting-stock solver. Today's runs made it several times faster (warm starts,
one knapsack table, batched rows, an approximate dual steepest-edge rule). Each
change left the answer within a fraction of a percent of the LP lower bound,
but the pool of cutting patterns differs, so the *rounding* lands on a
different integer order.

On the small built-in sample house that showed: the lumber line moved from
$2,389.60 to $2,384.44 (238 to 236 2x4 boards). The committed
`sample-bid-package.html` still held the older figure, so
`sample-pack.test.mjs` failed on `main`. I first read the assertion
backwards and suspected a regression; the order of `assert.equal(actual,
expected)` arguments said the stale file was the "actual". Tracing the total
through each engine commit showed the cheaper order is the current one.

Fix: regenerate the sample (`node build-sample-pack.mjs`). Lesson: a pinned
generated file belongs to the solver's output, and a solver speedup that
preserves quality can still change it. Invented house and prices only.
