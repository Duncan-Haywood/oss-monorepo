# Pre-registration: a hinge-residual guard for `--hinge-test` (2026-11-15)

Written before the new guard was run on any series, synthetic or real. Context: README, "The 1976
acceleration, dated and tested on the levels": the guard reads the bias-corrected lag-1 autocorrelation
of the residuals about a **straight line**, and a real hinge makes those residuals stickier. On GCAG
1930-2024 (95 points) the straight-line rho is 0.76, above the short-series guard of 0.7, so the test
refused a series whose hinge residuals are far less sticky. The flagship `next:` lists "a hinge-residual
guard".

**Proposal (`guard: 'hinge'`).** Refuse when the bias-corrected rho of the residuals about the best
ordinary least-squares hinge is above the guard (0.9; 0.7 under 100 points). The bootstrap null keeps
drawing its noise with the straight-line rho (the null has no hinge), capped at 0.95 instead of at the
guard, so admitting a series never makes its null less sticky than its own line residuals.

**Risk.** A random walk with drift is fitted better by a hinge than by a line, so its hinge residuals
are less sticky; the new guard may admit unit-root series and the level test then over-rejects.

**Fixed now.** Margin 0.15; synthetic: 300 series per cell, 99 bootstrap replicates; real: 999
replicates, seed 1. The scripts are `eval/hinge-guard-sim.mjs` and `eval/hinge-guard-real.mjs`, and
both guards are run on the same series.

**Bars (all must hold for `hinge` to become the default; otherwise the README records the negative
result and the default stays `line`).**

- S1. Size on a straight line plus AR(1) noise, the existing 12 cells (n 60, 145, 300; rho 0, 0.3, 0.6,
  0.8): share of all series with p <= 0.05 (refusals count as not rejecting) within 2-8% in every cell
  where 100 or more series are tested, and at most 8% in every cell.
- S2. Unit-root and near-unit-root nulls: random walk with drift 0.02 and sd 1 innovations, and a line
  plus AR(1) noise with rho 0.9 and 0.95, each at n 60, 145, 300 (9 cells): share of all series rejected
  at p <= 0.05 at most 8% in every cell.
- P. Power at short n, where the guard bites: n 95, rho 0.5, slope change at 65% of the series of 0.05,
  0.1 and 0.2 per step (sd 1 innovations): the hinge guard's share with p <= 0.05 is at least 10 points
  above the line guard's in at least one cell, and below it in none.
- R. Real series: GCAG 1930-2024 is tested (not refused), with p <= 0.05 and a knot in 1960-1990; GCAG
  1880-2024, GISTEMP 1880-2024 and GCAG 1850-2024 keep p <= 0.01 and a knot in 1960-1985; log US real GDP
  and log US labour productivity are still refused.

The 1960-1990 window for the 1930 start is recalled from the literature (a mid-1970s acceleration), not
read from a source here, so it is a plausibility check, not a labelled hit.
