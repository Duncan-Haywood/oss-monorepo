# Pre-registration: the synthetic control matched on covariates (2026-11-17)

Written after an exploratory simulation (hashed seed base 31000, 50 panels a cell, `eval/synth-cov-explore.out.txt`)
and before the confirmatory simulation (fresh hashed base **33000**, 200 panels a cell) and before any real state is
fitted with covariates. Committed on its own before either run.

**Why.** The floored-ratio round (README "A floored ratio", `eval/synth-floor-prereg-2026-11-17.md`) put California
1st of 39 but left Massachusetts, Arizona and Oregon at ranks 6, 13 and 6. Their before-gaps (3.0 to 5.5 packs) are
worse than 55-78% of the donors': matched loosely, not over-fitted. It ended: "covariates (income, price, the 15-24
share) ... would give the fit something more to go on".

**What was seen before this file.** No real state has been fitted with covariates. The two new data files
(`data/us-cigarette-retail-price.csv`, `data/us-personal-income-per-capita.csv`) were written and their first rows
printed to check the reshape (1970-1971 values only; CA and UT prices in 1988, 1.264 and 1.356). The outcome-only
results on the real states are the last round's, in the README. The exploratory simulation was seen (table below).

**Method** (`synth-control.mjs`, `synthControlTest(y, donors, k, { predictors })`, fixed by this file).
- Each predictor is divided by its standard deviation over all units (treated and donors), one scale for every fit.
- W(V) minimises sum_m v_m (x1_m - X0_m W)^2 on the simplex (FISTA on the p rows, warm-started from the previous
  inner solve); V = softmax(theta), theta by Nelder-Mead from equal weights (step 1, at most 160 evaluations),
  minimising the before-date squared outcome gap under W(V). The best evaluated V is kept.
- Every placebo goes through the same procedure; placebo pool 'without'; statistic: the floored ratio (the shipped
  default), the paper's ratio reported.
- Real predictors (`eval/synth-cov-real.mjs`): ln per capita personal income and the average retail price per pack,
  each averaged over the nine years before the date; packs per head at date-14, date-9 and date-1 (1975, 1980, 1988
  for California); years before 1970 clamped to 1970 (in-time placebos only). The paper's 15-24 population share and
  beer consumption are left out: no source for them was reachable and documented this session. That is a departure
  from Abadie et al. (2010, Table 1), stated in the README whatever the result.
- Simulated predictors (`eval/synth-cov-sim.mjs`): the unit's two factor loadings plus N(0, 0.15) noise, and the
  outcome at k-14, k-9, k-1 (k-9, k-5, k-1 when k < 15). Cells and panels are the floored-ratio round's.

Exploratory (base 31000, 50 a cell), floored ratio, p <= 0.05 (p <= 0.10):

| cell | covariates | outcome (shipped) |
|---|---|---|
| N1-N7 | 0-8% (4-14%) | 0-4% (2-12%) |
| E1 outside | 12% (18%) | 10% (16%) |
| P1, P2, P3 | 46, 8, 32% | 58, 12, 32% |
| P4, P5, P6 | 26, 36, 54% | 32, 54, 50% |

The covariate fit is looser before the date in every cell (mean before RMSPE 0.46-0.75 against 0.33-0.69), as it
must be: the outcome-only fit minimises that gap directly. Its power was lower in P1 and P5 in exploration.

## Bars (covariate fit, floored ratio, confirmatory run, 200 panels a cell)

200 panels give a binomial standard error of 1.5 points at 5%, so the size bars are one point looser than the last
round's 400-panel bars.

1. **Size.** In each of N1-N7, p <= 0.05 in at most 7% of panels and p <= 0.10 in at most 15%.
2. **Outside the hull.** E1: p <= 0.05 in at most 8%.
3. **Power.** On every one of P1-P6, the covariate fit's share with p <= 0.05 is at least the outcome fit's less 10
   points (same panels).
4. **Real** (`node eval/synth-cov-real.mjs > eval/synth-cov-real.out.txt`; the last round's states, windows, donor
   pools and bars unchanged): T1 California 1989 p <= 0.05 with the average gap -30 to -10 packs and the gap at 2000
   below 0; T2-T4 (MA 1993, AZ 1995, OR 1997) at least 2 of 3 with p <= 0.10 and a negative average gap; I
   (California cut at 1988, fake dates 1980 and 1984) neither p <= 0.05; Q (nine placebo states at 1989) at most 1
   of 9 with p <= 0.05.

**Decision.** The `predictors` option stays in the module either way, as a library function documented with these
results. If 1-3 hold it is described as calibrated in simulation. Only if 1-4 all hold does the README recommend it
over the outcome-only fit and a `--synth-control` CLI become the next item; otherwise the README says which bar
failed and the outcome-only fit stays the default.
