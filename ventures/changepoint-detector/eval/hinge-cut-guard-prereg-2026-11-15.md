# Pre-registration: a "rho cut" guard for `--hinge-test` (2026-11-15, later)

Written after one exploratory look at cut distributions (below) and before the guard was run through
`hingeTest` on any series, synthetic or real. Context: README, "A guard read off the hinge's residuals":
the shipped `line` guard refuses GCAG 1930-2024 (straight-line rho 0.76 > 0.7 under 100 points), and
the `hinge` guard fixes that but admits random walks (S2 fails: 11-16% rejections at n 60 and 145). That
section suggested "one that refuses when a hinge cuts the rho by less than a unit root's typical cut".

**Exploration already done (development seeds 7e7 and up, not reused below).** 400 series per cell of
`cut = rhoLine - rhoHinge` (both bias corrected). The 99th percentile of the cut under the nulls:
n 60: 0.40-0.47; n 95: 0.23-0.28; n 145: 0.16-0.22; n 300: 0.05-0.09. The random walk had the largest
99th percentile in every n. Under a slope change of 0.2 per step at n 95 (rho 0.5) the median cut was
0.32. Nothing was tuned on rejection rates.

**Proposal (`guard: 'cut'`).** When the shipped line guard admits a series, nothing changes (same
statistic, same null). When it would refuse, admit only if both hold:

1. the bias-corrected rho of the best OLS hinge's residuals is at or under the guard (0.9; 0.7 under
   100 points), and
2. the cut `rhoLine - rhoHinge` is above the 99th percentile of the same cut over 299 random walks of the
   same length (Gaussian steps, seed 7 fixed, so the bar depends on n only; the cut is invariant to the
   walk's drift and scale).

An admitted series' bootstrap null draws with its straight-line rho capped at 0.95 (as for `hinge`).

**Fixed now.** Margin 0.15; synthetic: 300 series per cell, 99 bootstrap replicates; real: 999
replicates, seed 1. Scripts: `eval/hinge-cut-guard-sim.mjs` (the `hinge-guard-sim.mjs` cells with every
seed base moved by +50,000,000, so the series are fresh) and `eval/hinge-cut-guard-real.mjs`. The line
guard is run on the same fresh series for comparison.

**Bars (the same four as the hinge-guard pre-registration; all must hold for `cut` to become the default
of `--hinge-test`; otherwise the README records the result and the default stays `line`).**

- S1. Straight line plus AR(1), the 12 cells (n 60, 145, 300; rho 0, 0.3, 0.6, 0.8): share of all series
  with p <= 0.05 (refusals count as not rejecting) within 2-8% where 100 or more are tested, at most 8%
  in every cell.
- S2. Random walk with drift 0.02, and AR(1) rho 0.9 and 0.95, at n 60, 145, 300: at most 8% in every cell.
- P. n 95, rho 0.5, slope change at 65% of 0.05, 0.1, 0.2 per step: `cut` at least 10 points above
  `line` in one or more cells and below it in none (ties within 1 point count as not below).
- R. GCAG 1930-2024 tested with p <= 0.05 and knot in 1960-1990; GCAG 1880-2024, GISTEMP 1880-2024 and
  GCAG 1850-2024 keep p <= 0.01 and a knot in 1960-1985; log US real GDP and log US labour productivity
  are still refused. R's 1930 cell is the case that motivated the guard, so it is seen, not fresh.
