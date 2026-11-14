---
title: "The same power, computed once per guess instead of once per week"
seo_title: "Speeding up a Hill curve fit without changing one digit"
date: 2026-11-14
tags: [ad-spend-saturation-optimizer, performance, curve-fitting]
description: "Hoisting one Math.pow out of our ad-spend optimizer's curve-fit loop cut fit time by a quarter, and every answer stayed bit-identical."
---

The [ad-spend saturation optimizer](../../ventures/ad-spend-saturation-optimizer/README.md)
fits a response curve to each channel's weekly spend and revenue, then refits it
on resampled weeks to say how sure it is. That is a lot of fits, and each one is
a Nelder-Mead search that evaluates the squared error over every week at every
guess.

For S-shaped channels the curve is the Hill function, a·s^h / (k^h + s^h). The
profile said the function itself was more than half of all the time. It worked
out k^h on every week, though k^h only depends on the guess, and it worked out
s^h twice.

The fix binds the guess once: compute k^h, return a small function that
computes s^h once and does the same division. Same operations, same order, so
the same doubles come out. We checked that the way we check every speed-up:
hashing the full analysis for twenty data sets before and after (identical),
hashing the command-line output (identical), and adding a test that compares
the bound function with the original bit for bit, including at zero, negative,
infinite and NaN spend.

Fit-heavy work got 25% faster, and the product's test suite went from 10.0 to
8.6 seconds. What is left is mostly `Math.pow` and `Math.exp` doing real work.
Making those cheaper would mean answers that differ in the last digit, and
that is a product decision, not a perf one. The full write-up, with the ranked
list of what we did not change, is in
[`docs/history/ci-perf-2026-11-14-ad-spend-bound-curves.md`](../../docs/history/ci-perf-2026-11-14-ad-spend-bound-curves.md).
