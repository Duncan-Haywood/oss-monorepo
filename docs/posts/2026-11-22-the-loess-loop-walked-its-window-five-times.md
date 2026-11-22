---
title: "The loess loop walked its window five times"
seo_title: "STL/MSTL decomposition in JavaScript 30% faster, bit-identical"
date: 2026-11-22
tags: [perf, javascript, time-series, stl, loess]
description: "Fusing passes and tabling tricube weights cut the STL decomposition tool's MSTL time by about 30%, with every output bit-identical to before."
---

The [STL decomposition tool](https://marisstella.app/stl-decomposition/)
splits a time series into trend, seasonal cycles and remainder, in the
browser. With two cycles at once (MSTL, say the day and the week in hourly
electricity load) it runs a lot of loess smoothing: for every point, a
weighted straight-line fit over a window that can be a few hundred points
wide.

A CPU profile of the test suite put 97% of the time in one function, the one
that does a single loess fit. It walked its window five times: once to work
out the tricube weights, once to normalise them, once for the weighted mean,
once for the spread, and once to tilt the weights and sum.

Two things were cheap to fix. The tricube weight depends only on the distance
to the point and the window's half-width, both whole numbers, so a small table
per half-width replaces a cube and a division per point. And normalising can
happen in the same loop as the mean, tilting in the same loop as the final
sum. That leaves three passes instead of five, plus the table lookups.

What we did not do is the bigger rewrite: running sums that slide along the
series, so each fit costs a few additions instead of a pass over the window.
It would be faster, but it adds the numbers up in a different order, so the
output would drift in the last few bits. The tool is checked against
statsmodels to seven decimal places, and we wanted the old and new outputs to
be byte for byte the same, which they are.

Result: the MSTL reference cases run in about 2.9 s instead of 4.3 s, and the
engine's test file in 3.5 s instead of 4.7 s. The same code runs on the page,
so a visitor pasting a few months of hourly data waits about a third less.
