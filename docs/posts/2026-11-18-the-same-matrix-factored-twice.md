---
title: "The same matrix, factored twice: a third off a Gaussian-process fit"
seo_title: "Faster Gaussian process fitting in JavaScript, same answers"
date: 2026-11-18
tags: [gaussian-process-regression, perf, algorithms]
description: "A line search factored the covariance matrix, then the gradient factored it again. Reusing it and tiling the loops cut a fit from 15.5 s to 10.7 s."
---

The [Gaussian process regression tool](https://marisstella.app/gaussian-process-regression/)
fits a kernel to a series by maximising the log marginal likelihood, the way
scikit-learn does. It runs entirely in your browser. On the bundled example,
201 months of Mauna Loa CO2, trying all seven kernels took about 15.5 seconds
on a four-core test machine. Nearly all of that went on two pieces of linear
algebra: the Cholesky factor of the 201 x 201 covariance matrix (6.4 s) and the
inverse built from it (4.2 s).

**The first finding was waste, not slowness.** The optimiser is a projected
L-BFGS. At each step it tries a point and asks for the likelihood alone. If
the point is good enough, it then asks for the gradient at that same point.
The gradient routine built the covariance matrix again and factored it again,
even though the trial had just done exactly that. Now the fitter keeps the
trial's factor and hands it over when the gradient is asked for at the very
same point. That alone took the run from 15.5 s to 13.3 s.

**The second was memory traffic.** A Cholesky factor of a 201 x 201 matrix is
about 1.35 million multiply-adds, and in JavaScript each one was waiting on
loads more than on arithmetic. The loops now finish two columns of the factor
at once, against four rows at a time. That is eight running sums fed by six
loads per step, where before it was four sums from five loads. The inverse got
the same treatment in both of its passes.

The catch with reordering loops is that floating-point addition is not
associative, so a "faster" factor can quietly give different digits. These
tiles avoid that. Every entry still adds its products in the same order, from
the same starting term. The one extra term a tile owes (the entry that
depends on a column finished a moment earlier) is added where the plain loop
would have added it, last or first. A test compares the tiled loops with the
plain ones bit for bit at 16 sizes, up to the example's 201. The tool's whole
output, as a hash over its JSON, CSV and text reports, is identical before
and after.

The result: the full seven-kernel fit fell from 15.5 s to **10.7 s**, the
command-line runs from 32.2 s to 23.0 s, and the tool's test suite from
12.0 s to 8.5 s.

What's left is spelled out in the
[write-up](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-18-gaussian-process-regression-reused-factor-and-2x4-tiles.md).
The inverse is now the largest cost. The next real gain means summing in a
different order, and that needs an argument about rounding error, not a
byte-for-byte check.
