# Pre-registration: several starts for the V search (2026-11-17)

Written after an exploratory simulation (hashed seed base 41000, 20 panels a cell, `eval/synth-multi-explore.out.txt`)
and before the confirmatory simulation (fresh hashed base **43000**, 80 panels a cell) and before any real state is
fitted with the multi-start search. Committed on its own before either run.

**Why.** The covariate round (README "Matched on covariates", `eval/synth-cov-prereg-2026-11-17.md`) failed bars 2 and
4. Its diagnosis, after the run: Oregon's V ended at 0.149, 0.405, 0.149, 0.149, 0.149, one simplex step from the
equal-weights start, with a before-1997 gap of 19.6 packs against 5.5 matched on its own sales. The before-gap is
piecewise flat in V (W jumps between donor sets), so Nelder-Mead from one start stalls; Georgia's and Montana's
placebo fits showed the same stall. It ended: "a multi-start V search (one start per predictor plus equal weights)".

**What was seen before this file.** No real state has been fitted with the multi-start search. The exploratory
simulation was seen (table below). The covariate round's real and simulated results are in the README.

**Method** (`synth-control.mjs`, `synthControlTest(y, donors, k, { predictors, vSearch: 'multi' })`, fixed here).
- Everything is the covariate round's (predictor scaling, W(V) by FISTA on the p rows, V = softmax(theta), Nelder-Mead
  step 1, at most 160 evaluations a start, placebo pool 'without', floored ratio), except the starts.
- Starts: theta = 0 (equal weights, the last round's only start), then for each predictor m, theta_m = 3 and the rest
  0 (v_m about 0.83 with five predictors). Each start gets its own 160-evaluation budget and the inner solver's warm
  start is reset. The best before-gap seen by any start is kept, so no fit can be looser than the one-start fit (the
  first start is that fit, evaluation for evaluation; `synth-control.test.mjs` checks it).
- Every placebo goes through the same search.
- Real predictors, states, windows, donor pools and dates: the covariate round's (`eval/synth-multi-real.mjs` differs
  from `eval/synth-cov-real.mjs` only in fitting three ways and reading the bars off the multi-start fit). The paper's
  15-24 share and beer consumption are still left out (no source this session).
- Simulation (`eval/synth-multi-sim.mjs`): the covariate round's cells, panels and predictors; each panel tested with
  the multi-start covariate fit, the one-start covariate fit and the outcome fit.

**Exploratory** (base 41000, 20 panels a cell, `eval/synth-multi-explore.out.txt`), floored ratio, p <= 0.05 (p <= 0.10), 20 panels
a cell, so each cell is accurate to about 5 points either way:

| cell | multi-start | one start | outcome (shipped) |
|---|---|---|---|
| N1-N7 | 0-10% (0-25%) | 0-10% (0-25%) | 0-20% (5-30%) |
| E1 outside | 10% (10%) | 10% (15%) | 10% (10%) |
| P1, P2, P3 | 70, 20, 35% | 60, 15, 40% | 55, 20, 30% |
| P4, P5, P6 | 25, 60, 50% | 30, 50, 45% | 25, 60, 45% |

The multi-start treated fit is tighter than the one-start fit in 40-85% of panels, but only a little on average (mean
before RMSPE 1-6% lower in every cell); most one-start searches were not stalled. E1's 10% matches the outcome fit
here, against the last round's 17.5% for one start on other seeds; 20 panels cannot tell those apart.

## Bars (multi-start covariate fit, floored ratio, confirmatory run, 80 panels a cell)

The search costs about six times the one-start fit (about 20 s a panel for all three fits on one core, so about two
hours on this session's four cores at 80 panels a cell), so the confirmatory run is 80 panels a cell, not 200. 80
panels give a binomial standard error of 2.4 points at 5%, so the size bars are one point looser than the last
round's; a single cell at 8% is one or two panels from 6%, so read the size bars as a check for a gross failure.

1. **Size.** In each of N1-N7, p <= 0.05 in at most 8% of panels and p <= 0.10 in at most 16%.
2. **Outside the hull.** E1: p <= 0.05 in at most 8% (the bar the one-start fit failed at 17.5%).
3. **Power.** On every one of P1-P6, the multi-start fit's share with p <= 0.05 is at least the outcome fit's less 10
   points (same panels).
4. **Real** (`node eval/synth-multi-real.mjs > eval/synth-multi-real.out.txt`; the last round's bars unchanged): T1
   California 1989 p <= 0.05 with the average gap -30 to -10 packs and the gap at 2000 below 0; T2-T4 (MA 1993, AZ
   1995, OR 1997) at least 2 of 3 with p <= 0.10 and a negative average gap; I (California cut at 1988, fake dates 1980
   and 1984) neither p <= 0.05; Q (nine placebo states at 1989) at most 1 of 9 with p <= 0.05.

Reported, not a bar: Oregon's before-1997 gap under the multi-start fit (one start: 19.6 packs), and the share of
panels where the multi-start treated fit is tighter than the one-start fit.

**Decision.** If 1-3 hold, `vSearch: 'multi'` becomes the default whenever predictors are given (it is never a looser
fit). Only if 1-4 all hold does the README recommend the covariate fit over the outcome-only fit and a
`--synth-control` CLI with predictors become the next item. Otherwise the README says which bar failed, the
outcome-only fit stays the recommended one, and `vSearch` stays an option.
