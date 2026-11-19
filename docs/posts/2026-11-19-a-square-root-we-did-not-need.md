---
title: "Half the time, same bits: skipping square roots in an exact matrix profile"
seo_title: "Faster exact matrix profile in JavaScript, same output"
date: 2026-11-19
tags: [performance, time-series, matrix-profile, javascript]
description: "The Matrix Profile Explorer now finds motifs and anomalies in about half the time, with output identical to the bit, by comparing correlations before taking square roots."
---

[Matrix Profile Explorer](../../ventures/matrix-profile-explorer/) finds
repeated patterns and anomalies in a time series you paste into the browser.
It computes the exact matrix profile with STOMP, which compares every window
with every other window, so the time grows with the square of the series
length. On a 4-core cloud runner, 20,000 points took about 2 seconds and
50,000 took about 13.

Each pair of windows had a correlation `r` turned into a distance,
`sqrt(2m(1 - r))`, which was then compared with the best distance so far. Almost
every pair loses that comparison. The distance only goes down as the
correlation goes up, and that still holds after floating-point rounding,
because each step (`1 - r`, the multiply, the square root) is a correctly
rounded operation, and those never reverse an order. So we now keep the
correlation of the best match too, and take the square root only for a pair
whose correlation beats it. The final test is still the old distance
comparison, so even rounding ties pick the same neighbour.

The result: 20,000 points in about 1 second, 50,000 in about 6.7, and the
profile, the neighbour index and every motif and discord unchanged to the last
bit. A new test runs the old loop next to the new one on 40 seeded series,
some of them built to tie, and checks every entry with `Object.is`.

What we did not do: replace the division with a multiply by a precomputed
reciprocal. That would be faster still, but it moves the last bit of some
correlations, and a tool that reports "the closest repeated pattern" should not
change its answer because of a speed-up. The write-up with the numbers is in
`docs/history/ci-perf-2026-11-19-matrix-profile-correlation-screen.md`.
