# Difference-in-differences with staggered adoption

States passed a law in different years, stores got a new layout in different
months, schools adopted a programme one cohort at a time: did it change the
outcome, and by how much? This tool runs **difference-in-differences** the way
the recent econometrics literature recommends when treatment starts at
different times, and shows why the old way can mislead:

- **Group-time effects** ATT(g,t) (Callaway & Sant'Anna 2021): a separate,
  clean 2x2 comparison for every cohort g (units first treated in period g)
  in every period t, against never-treated or not-yet-treated units.
- Their **aggregations**: overall, by time since treatment (the **event
  study**), and by cohort, with influence-function standard errors that
  include the estimation of the cohort-share weights, plus a **simultaneous
  band** over event times (multiplier bootstrap).
- A **Wald pre-test** of parallel trends on the pre-treatment estimates.
- The **two-way fixed effects** (TWFE) regression with unit-clustered errors,
  and its **Goodman-Bacon (2021) decomposition** into every 2x2 comparison
  with its weight, including the "later vs already treated" comparisons that
  bias TWFE when effects change over time.

**Live:** https://marisstella.app/difference-in-differences/ (runs in your
browser; nothing is uploaded).

## Use it

```
node cli.mjs --example
node cli.mjs panel.csv --unit state --time year --outcome y --cohort first_treated \
  [--treatment d] [--control never|notyet] [--base varying|universal] [--anticipation 0] \
  [--min-cohort 1] [--alpha 0.05] [--bootstrap 999] [--seed 20211] [--csv|--json]
node platform/agents/tools.mjs call difference-in-differences analyze --input '{"csv":"...","unit":"state","time":"year","outcome":"y","cohort":"first_treated"}'
```

Input is a long, balanced panel CSV: one row per unit and period, a numeric
period, the outcome, and either the first treated period (0 or blank for
never; a period after the last one counts as never within the window) or a
0/1 treatment column that switches on and stays on.

## Method

Implemented from the papers; `PAPERS` in `engine.mjs` lists what was
implemented from each and every deviation (also on the page and in `--help`).

- ATT(g,t) = mean change of cohort g from base period b to t, minus the mean
  change of the comparison group. After treatment b = g - 1 - anticipation;
  before treatment b = t - 1 (varying) or g - 1 - anticipation (universal).
  Not-yet-treated controls are units first treated after max(t, b) +
  anticipation, other than g. With no covariates the doubly robust,
  outcome-regression and IPW estimators of the paper coincide with this.
- Each estimate's influence function is n (Delta_i - mean_g) / n_g for cohort
  members and -n (Delta_i - mean_C) / n_C for controls; SE = sqrt(sum IF^2) / n
  (clustered by unit). Aggregations weight by cohort share and add the
  weight-estimation term of the paper.
- TWFE: beta = sum(D~ Y~) / sum(D~^2) on two-way demeaned data; CR1 standard
  errors with the small-sample factor G/(G-1) (NT-1)/(NT-K), K = 1 + T, which
  is what fixest and pyfixest use by default for unit-clustered errors with
  unit and period effects.
- Goodman-Bacon weights from sample shares and treatment-time shares (his
  equations for s_kU, s_kl^k and s_kl^l), checked to sum to one and to rebuild
  beta exactly.

## Verification

`node --test *.test.mjs` (47 tests). `eval/reference.py` runs **csdid 0.4.5**
(MIT; a Python port of R's `did` whose source documents each function as matching `did`) and
**pyfixest 0.70.0** (MIT) and writes `eval/reference.json` (pandas 3.1.1,
numpy 2.4.6). The tests check, on the castle-doctrine example (50 states,
2000-2010) and a simulated three-cohort panel (`eval/simulated.csv`, written
by the same script):

- every ATT(g,t) and its standard error within 1e-9 of csdid, for
  never-treated and not-yet-treated controls, varying and universal base
  periods, and with the one-state cohorts dropped;
- the simple, event-time and cohort aggregations and every event-time and
  cohort row, with standard errors, within 1e-9;
- the Wald pre-test statistic within 1e-7 where csdid reports one (simulated
  panel: 28.55 on 15 df), and no group-time pre-test where csdid finds the
  covariance singular (both castle runs);
- the TWFE coefficient and clustered SE within 1e-9 of pyfixest
  (castle 0.0694, SE 0.0559).

Property tests: the 2x2 case equals the hand calculation; a planted constant
effect under exact parallel trends is recovered in every cell for all four
option pairs; effects that grow over time pull TWFE below the clean estimate
through the "later vs already treated" comparisons; the decomposition sums to
one and rebuilds TWFE on 25 random panels with always-treated units;
anticipation, row order, unit names and unit-level shifts behave as they
should; the simultaneous band is reproducible by seed and contains the
pointwise one; and the distribution functions match known quantiles.

## What the example shows

Castle-doctrine laws, log homicide rate, never-treated states as controls, no
covariates or weights (so not the paper's specification):

- TWFE gives 0.069 (SE 0.056). The decomposition puts 89.9% of its weight on
  treated-vs-never comparisons (average 0.078), 7.7% on earlier-vs-later
  (-0.029) and 2.4% on later-vs-already-treated (0.046).
- The group-time estimator gives 0.019 overall (95% CI -0.056 to 0.095). The
  gap comes mostly from the base period: TWFE compares post-adoption years with
  all pre-adoption years, while ATT(g,t) compares them with the year just
  before adoption, and the event study shows the treated states' rate already
  up in that year (e = -1: 0.097, 95% CI 0.020 to 0.175).
- Two cohorts have one state each, so the tool reports no pre-test. With
  `--min-cohort 2` the overall effect is 0.005 (CI -0.068 to 0.078) and the
  event-time pre-test rejects parallel trends (chi-square 20.95 on 8 df,
  p = 0.007).

This is what the tool computes on this data under these choices; it is not a
finding about castle-doctrine laws.

## Limits

No covariates (unconditional parallel trends), no treatment reversals,
balanced panels only, no repeated cross-sections, no sampling weights. One-unit
cohorts have standard errors that are too small (the tool says so). Next:
covariates by the doubly robust estimator, the imputation estimator of
Borusyak, Jaravel & Spiess (2024) as a second clean estimator, and HonestDiD
sensitivity bounds (Rambachan & Roth 2023) for the pre-trends.

## Disclaimer

No warranty. Statistical estimates from data you supply; not legal, tax,
financial, medical or policy advice, and not proof of what caused an outcome.
Not affiliated with the authors of the cited papers or the did, csdid, fixest
or pyfixest projects. FSL-1.1-MIT licence.
