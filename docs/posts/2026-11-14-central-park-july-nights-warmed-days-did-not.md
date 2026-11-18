---
title: "Central Park's July nights warmed by 0.79 °C at every quantile; its days did not move"
seo_title: "Free Wasserstein distance calculator: earth mover's distance"
date: 2026-11-14
tags: [wasserstein-distance, optimal-transport, sinkhorn, research-algorithms, climate, browser, testing]
description: "A free earth mover's distance tool compares two groups in your units. On NOAA's Central Park data, July nights moved up at every quantile and days did not."
---

A difference in means tells you whether a distribution moved on average. It
doesn't tell you whether the whole thing moved, or whether one tail moved and
the other stayed put. The **Wasserstein distance** answers that in the data's
own units. It is also called the earth mover's distance: the least work
(mass times distance) needed to reshape one group's values into the other's.

The new [Wasserstein distance tool](../../ventures/wasserstein-distance/) takes
a CSV with a group column. For each numeric column it gives W1 and W2
exactly. It splits W1 into mass moved up and mass moved down (their sum is
W1, their difference is the mean shift), splits W2² into location, spread and
shape, lists the shift at seven quantiles, and runs a permutation test. Nothing
is uploaded. It also runs as a zero-dependency CLI and as an agent call.

## The example: 930 July days, then and now

NOAA's GHCN-Daily record for New York Central Park (station USW00094728,
public domain) has a maximum and a minimum temperature for every July day of
1951-1980 and of 1991-2020, 930 days in each period with nothing missing.

| Column | W1 (°C) | Mean shift | Moved up | Moved down | p (999 shuffles) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Night low | 0.789 | +0.789 | 0.789 | 0 | 0.001 |
| Day high | 0.208 | −0.07 | 0.069 | 0.139 | 0.445 |

For the night low, W1 equals the mean shift and nothing moved down, so every
quantile is higher in 1991-2020: +0.6 to +1.2 °C from the 5th percentile to
the 95th. The day high hardly changed. Its 5th and 25th percentiles are
0.6 °C cooler, the rest match, and the difference is within chance. A comparison of
means alone would not show that the night-time change is a shift of the
whole distribution rather than a hotter tail.

Two cautions, both on the page. Consecutive July days are correlated, so the
shuffle p-values are rougher than they look. The station records whole
degrees Fahrenheit, so the Celsius quantiles move in steps of 5/9 °C. Why the
nights warmed (urban heat, humidity, a wider climate trend) is a question
this data can't settle.

## Several columns: a range you can trust instead of a blurred number

For both columns at once the tool solves optimal transport between the two
clouds of (high, low) points. Exact transport is a linear programme. The
standard fast method, **Sinkhorn's algorithm** (Cuturi 2013), adds an entropy
penalty that blurs the problem, so the number it returns is not the exact
distance. At the default blur, the Sinkhorn cost here is about 0.890 °C. The exact
value, from POT's network simplex, is 0.8747.

Instead of reporting the blurred number, the tool brackets the exact one.
Rounding the Sinkhorn plan to exact marginals (Altschuler, Weed & Rigollet
2017) gives a real transport plan, so its cost is an **upper bound**. Taking
two c-transforms of Sinkhorn's dual potential gives a feasible dual solution,
so its value is a **lower bound** (weak duality). On the example the bracket
is 0.843 to 0.891 °C at the default blur (4.7 s in our container) and 0.862 to
0.882 at half the blur (7.5 s). The exact 0.8747 is inside both, as it is in
every test case. Under the transport plan, 84% of the squared movement is in
the night low. The energy-distance permutation test gives p = 0.005.

## How it was checked

The engine was written from the papers. POT 0.9.7 and SciPy 1.17.1 were used
only to produce a reference file:

- W1 and W2 on the line match `scipy.stats.wasserstein_distance` and
  `ot.wasserstein_1d` to 1e-12, with and without weights.
- The Sinkhorn plan matches `ot.sinkhorn` entry by entry to 1e-10 on four
  seeded 2-D problems.
- The certified range contains `ot.emd2`'s exact cost on every problem at
  three blurs, and the brute-force best assignment over all 720 permutations
  on five 6 × 6 problems.

The first version ran Sinkhorn fully in the log domain and took 85 s on the
example. Rebuilding the kernel around the log-domain potentials and iterating
with plain matrix-vector products between rebuilds (the stabilised scaling
described in Peyré & Cuturi's book) brought it to under 5 s, with no
exponentials in the inner loop.

Next, if people use it: the debiased Sinkhorn divergence and unbalanced
transport (for groups whose totals differ, such as sales by region) as
modes, and a Web Worker so the page stays responsive on large inputs.
