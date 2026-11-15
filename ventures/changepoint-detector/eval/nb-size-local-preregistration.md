# Clumping size against the local level: pre-registration (2026-11-15)

Written before the new estimator was run on any of the series below.

## The fault

`negbinSize` divides the median squared first difference by the **global**
mean. On counts that grow (rate 7 to 700 across the series) the median local
variance is small next to the global mean squared, so the size comes out
Infinity: `--overdispersion nb` then quietly runs the plain Poisson cost, and
steps absorb the growth. Measured before any change (`/tmp` probe, seeds 9101,
40 series per row, 200 counts, lognormal clumping sd 0.35, true size 7.67):
median estimated size 9.3 with no bend, 26.5 at bump 0.015, 104 at 0.025, and
Infinity on every quartile at bump 0.04. That is why only 14% of the steep
cell's bends were located within 20 points (`eval/growth-change-interval-nb-steep-only.out.txt`).

## The change

Solve for c = 1/r in median_t d_t^2 / (2 x 0.4549 x (m_t + c m_t^2)) = 1,
where d_t is the first difference and m_t the mean of a 7-point window around
the pair. With a constant level this is the old estimator; Poisson counts
(median ratio at c = 0 not above 1.05) still give Infinity.

## Bars (all must hold, or it does not ship)

1. Flat-ish clumpy counts (bump 0, seeds 9201, 100 series): median size within
   25% of the true 7.67.
2. Poisson counts (rate 10 and a ramp 7 to 700, 100 each, seed 9202): Infinity
   on at least 90 of 100 in each.
3. Steep cell (bump 0.04, `eval/growth-change-interval-nb-steep-only.mjs` on
   fresh seeds 9301-9302, 250 series each): bends located within 20 points rise
   from about 14% to at least 35%, and the 95% range holds the knot on at least
   85% of those found.
4. Straight log-linear clumpy series with growth 0.004 and 0.02 per point
   (no bend, 100 each, seed 9203): a bend kept on at most 5 of 100.
5. Every existing test in the venture passes, or a changed number on a real
   series is explained and the documented date still found.

## Round 1 result (same day): fails bar 2

Median version, run once on the seeds above: bar 1 holds (median size 9.04,
true 7.67; and the size now stays 9.0 to 9.4 at every bump, where the old one
went 9.0, 27, 180, Infinity); bar 4 holds and improves (a bend kept on 0 of 100
straight series at both growths, against 0 and 10 of 100 for the old size).
Bar 2 fails: Poisson rate 10 reads as Poisson on 68 of 100 (old 91), the ramp
on 54 of 100 (old 100). Cause: at small counts d^2 takes lattice values and the
median of the ratios jumps across 1.05. Not shipped; bar 3 not run.

## Round 2 (written before any round-2 number on the seeds below)

Change: replace the median with a winsorised mean, mean_t min(z_t, 6.635) =
0.9813 (E min(chi2_1, K)), and call it Poisson unless the c = 0 mean clears
0.9813 by two standard errors (variance x 1.5 for overlapping differences).
Tuned on the round-1 seeds 9201 and 9202 only (Poisson 10: 98 of 100 Infinity;
clumpy median size 8.47). The same five bars, on fresh seeds: bar 1 seed 9501,
bar 2 seed 9502, bar 3 seeds 9601 and 9602 (250 series each), bar 4 seed 9503.
If any bar fails, it does not ship and the old estimator stays.

## Round 2 result: all five bars hold; ships as the only `negbinSize`

Fresh seeds, run once (`eval/nb-size-local.out.txt`, `eval/nb-size-local-steep.out.txt`):

1. Holds. Median size 8.19 against the true 7.67 (7%); 8.2 to 8.6 at every bump, where the global-mean size gave 8.6, 31, 123 and Infinity.
2. Holds. Poisson rate 10: Infinity on 99 of 100 (old 95); Poisson ramp 7 to 700: 100 of 100 (old 100).
3. Holds. Steep bends located within 20 points on 280 of 500 (56%; old size on the same seeds 81 of 500, 16%); the 95% range held the knot on 278 of 280 (99%; old 58 of 81, 72%). Median width 46 points.
4. Holds. A bend kept on 0 of 100 straight series at growth 0.004 and at 0.02 (old 0 and 11); step changes per series 0.14 and 0.08 (old 0.25 and 1.86).
5. Holds as worded. 739 of 747 tests passed unchanged; the 8 that moved are pinned counts on real series, all fewer changes, and no documented date was lost: the Ansett 1989 stop and restart are still found in every setup and the stop's range still holds it on 29 of 30 routes; the 1979-10 cut on UK lung deaths (no documented step there) is gone; the holiday list still removes changes in every year of US births. One pinned observation reversed: on bike-share days at period 365 the holiday list now adds changes (29 to 36) instead of removing them (134 to 125).
