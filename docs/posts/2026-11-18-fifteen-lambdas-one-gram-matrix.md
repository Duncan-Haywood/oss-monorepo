---
title: "Fifteen penalties, one Gram matrix: a 5x faster conformal interval page"
seo_title: "Speeding up ridge cross-validation by caching each fold's Gram matrix"
date: 2026-11-18
tags: [perf, conformal-prediction-intervals]
description: "The conformal interval tool rebuilt each cross-validation fold 15 times. Building it once: 462 ms to 89 ms per analysis, bit-identical output."
---

The [conformal prediction interval tool](https://marisstella.app/conformal-prediction-intervals/)
turns a CSV into prediction intervals with a coverage guarantee. Under the hood each method
fits a ridge regression whose penalty is picked by 5-fold cross-validation over a grid of
fifteen values.

A CPU profile of its test suite put almost all the time in that cross-validation, and the
reason was plain once read: for every penalty value, every fold re-standardised its training
rows and re-accumulated the Gram matrix `Z'Z`. None of that depends on the penalty. The
penalty only adds a number to the diagonal just before the solve.

So each fold now does the scaling and the matrix once, and the grid loop only copies the
matrix, adds the penalty and solves a small linear system. The order of every floating-point
operation is unchanged (the diagonal was always added after the sum), so the output is the
same to the last bit: a digest over 60 seeded data sets and all three interval methods matches
before and after, and a new test pins it.

| | before | after |
|---|---:|---:|
| one analysis of the bundled 442-row diabetes data | 462 ms | 89 ms |
| the same with 50 repeated splits | 1.15 s | 0.38 s |
| the engine's test suite | 4.6 s | 1.4 s |

The analysis runs in the browser when you click Run, so this is the page responding in under a
tenth of a second instead of half a second. The full reading, profile and what was left alone
are in [the perf note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-18-conformal-ridge-fold-prep.md).
