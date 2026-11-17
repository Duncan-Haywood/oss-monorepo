# Pre-registration: a synthetic control for a date you name (2026-11-17)

Written after an exploratory simulation (seed base 11000, 100 panels a cell, `eval/synth-explore.out.txt`) and
before the confirmatory simulation (fresh seed base **13000**, 400 panels a cell) and before `eval/synth-real.mjs`
has been run. Committed on its own before either run.

**What was seen before this file.** The state tobacco data were used by the last round (README "The step alone, with
a control series"): California's log ratio to the plain mean of the 38 donors, with the guard off, showed a step of
-5.6% and a slope change of -0.033 a year; Arizona -6.9%. No synthetic control has been fitted to any real state.
The published result this round can be compared with: Abadie, Diamond and Hainmueller (2010) estimate that by 2000
California's per-head sales were about 26 packs below its synthetic control, about 20 packs on average over
1989-2000, and that California's after/before RMSPE ratio is the largest of the 39 states (p 1/39 = 0.026). They
matched on covariates (income, beer, retail price, share aged 15-24) and three lagged sales years; this version
matches on every before-period sales value and no covariates, so its weights are expected to differ.

**Why.** The step-alone round ended: "a synthetic control (weights fitted on the before-period, Abadie et al. 2010)
instead of a plain mean", after state-against-mean ratios wandered (median rho 0.76) and every real pair was refused.

**Method** (`synth-control.mjs`, fixed by this file). Weights >= 0 summing to 1 minimise the squared gap between the
treated series and the weighted donors over the points before the date (accelerated projected gradient on the
simplex). Statistic: after-date RMSPE / before-date RMSPE. p = (1 + donors whose own ratio, each fitted against the
other donors with the treated unit left out, is at least the treated's) / (donors + 1). Fit warning: the treated's
before-date RMSPE is worse than at least 80% of the donors' own. Levels, not logs.

**Simulation** (`eval/synth-sim.mjs`; cells as in the script: N1-N5 no change, E1 the treated unit outside the
donors' range, P1-P4 an effect on the treated unit). Confirmatory: `SC_SEED_BASE=13000 SC_SHARD=i/4 node
eval/synth-sim.mjs 400` for i 0-3, merged by `node eval/synth-merge.mjs` into `eval/synth-confirm.out.txt`.

## Bars

1. **Size.** In each of N1-N5, p <= 0.05 in at most 6% of panels and p <= 0.10 in at most 14% (exact levels: 2.6%
   and 10.3% with 38 donors, 5.0% and 10.0% with 19 in N3).
2. **Outside the hull.** E1: p <= 0.05 in at most 6%, and the fit warning on at least 90%.
3. **Power** (p <= 0.05, share of all panels): P1 (a step of 2 noise sd) at least 28%; P3 (the same step, every unit
   also wandering on its own) at least 18%. P2 (an effect that grows to 3 sd, sticky noise) and P4 (short series) are
   reported without a bar.
4. **Real** (`node eval/synth-real.mjs > eval/synth-real.out.txt`; packs per head, fiscal years, 1970 to the stated
   end; donors = the 38 of Abadie et al., less any whose state tax per pack rose by 50 cents or more from FY1988 to the
   window's end, chosen from `data/us-cigarette-state-tax.csv` only: 38, 38, 35 and 27 donors below):
   - **T1** California, Proposition 99, date 1989, 1970-2000: p <= 0.05, average gap 1989-2000 between -30 and -10
     packs, gap at 2000 below 0.
   - **T2-T4** Massachusetts 1993 (to 2000), Arizona 1995 (to 2002), Oregon 1997 (to 2004): at least 2 of 3 with
     p <= 0.10 and a negative average gap.
   - **I** in-time placebos: California with the window cut at 1988, fake dates 1980 and 1984: neither p <= 0.05.
   - **Q** the nine placebo states of the last round (AL, GA, KY, MS, MT, SC, TN, VA, WV; tax per pack changed by at
     most 2 cents FY1985-FY1995), each at 1989, 1970-2000, against the other 37 donors: at most 1 of 9 with p <= 0.05.

If 1-4 all hold, `--synth-control <column>` ships in the CLI with `--known-date`, on a CSV of several columns (the
others, or `--columns`, are the donors), printing the weights, the fit, the gap, the in-space p, the fit warning and
one in-time placebo halfway through the before-period. If any bar fails, the CLI option is taken out, the module stays
for reproducing the tables, and the README says which bar failed.
