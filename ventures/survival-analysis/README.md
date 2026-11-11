# Survival analysis: Kaplan-Meier, log-rank and Cox regression

**How long until it happens, and does the group matter?** Paste a CSV with
one row per subject (a customer, a machine, a patient, an invoice), the time
each was watched and whether the event happened, and get:

- **Kaplan-Meier survival curves** with Greenwood log(-log) confidence bands,
  drawn with censoring ticks;
- the **median time to event** with its confidence interval, and the
  **restricted mean survival time** up to a horizon;
- a **log-rank test** of equal curves (or Gehan-Breslow / Tarone-Ware), for
  two or more groups;
- a **Cox proportional hazards model**: hazard ratios with intervals,
  likelihood-ratio, Wald and score tests, Efron or Breslow ties, a
  **proportional-hazards check** per term (Grambsch & Therneau 1994) and
  **Harrell's concordance**.

Live page: https://marisstella.app/survival-analysis/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/leukemia.csv --group treatment --covariates logWBC
node cli.mjs churn.csv --time days --event cancelled --event-value yes --group plan --curve
node cli.mjs data.csv --json            # the full result for scripts and agents
node ../../platform/agents/tools.mjs call survival-analysis analyze --input '{"csv":"time,event\n3,1\n5,0\n8,1"}'
```

Columns: `--time` (durations from each subject's start, any unit),
`--event` (1/0, true/false, yes/no, event/censored, 1/2 read as R does, or
`--event-value` names the event), optional `--group` (at most 20 values;
`--reference` picks the baseline for hazard ratios) and `--covariates`
(numeric columns as they are; text columns become 0/1 terms against their
first value). Rows with a missing value in a chosen column are dropped and
counted.

## Example: 6-MP against placebo

The bundled example is the Freireich et al. (1963) remission trial (42
children; `data/SOURCE.md`). On it the tool reports:

| | 6-MP | placebo |
| --- | --- | --- |
| relapses / patients | 9 / 21 | 21 / 21 |
| median weeks to relapse (95% CI) | 23 (13 to not reached) | 8 (4 to 11) |
| restricted mean up to 23 weeks | 17.9 | 8.67 |

Log-rank chi-square 16.79 on 1 df (p = 4.2e-5). Cox, Efron ties: placebo
hazard ratio 4.82 (2.15 to 10.8), likelihood ratio 16.35, Wald 14.53, score
17.25; Breslow ties give coefficient 1.509. Adding `logWBC` moves the
treatment hazard ratio to 4.00 (1.74 to 9.20) with logWBC at 5.42 per unit.
Adding `sex` as well, the proportional-hazards check gives sex p = 0.052:
borderline evidence that its effect is not constant over follow-up, so a
single hazard ratio for sex would average over a changing effect.

## Verification

Run `node --test` in this directory (or
`python3 platform/ci/run_venture_tests.py survival-analysis` from the root).

- **Two independent libraries.** `eval/reference.py` fits the example and
  three seeded synthetic data sets (`eval/cases/`: 120 rows with three
  groups and rounded, heavily tied times; 200 rows with three covariates and a
  three-level text covariate, times rounded to 2; 80 rows with near-continuous
  times) with **lifelines 0.30.3** and **statsmodels 0.15.0** and writes
  every number to `eval/reference.json`. `engine.test.mjs` checks, for every
  case and group:
  - Kaplan-Meier survival at every time (to 1e-12) and both band limits (1e-9)
    against lifelines;
  - median and its interval exactly, and the restricted mean (1e-10), against
    lifelines;
  - the log-rank statistic against lifelines (1e-10), and log-rank,
    Gehan-Breslow and Tarone-Ware against statsmodels' `survdiff` (1e-9);
  - Cox coefficients (1e-8), standard errors (1e-7) and the partial
    log-likelihood (1e-10) against statsmodels' `PHReg` for both Efron and
    Breslow ties; coefficients, standard errors and p-values against
    lifelines' `CoxPHFitter` to 1e-4 (lifelines stops Newton-Raphson at a
    looser tolerance; it and statsmodels differ from each other by the same
    amount); the likelihood-ratio test (1e-6), Harrell's C (1e-6) and the
    proportional-hazards statistic with `time_transform="km"` (1e-3) against
    lifelines.
- **Pinned values** for the example (the ones both libraries give, written
  out so a regression shows as a plain number): log-rank 16.79 with 9 observed and
  19.25 expected relapses on 6-MP; Efron coefficient 1.572 (HR 4.82), LR
  16.35, Wald 14.53, score 17.25.
- **Identities and properties.** With no tied event times the Cox score test
  of one binary covariate equals the log-rank statistic (both tie methods,
  1e-10); shuffling rows changes nothing; rescaling a covariate rescales only
  its coefficient; swapping the reference group flips the sign; a hand-worked
  Kaplan-Meier with a tie and censoring; concordance on perfect, reversed and
  constant scores; the chi-square and normal functions against standard
  quantiles.
- **Failure modes.** A covariate that perfectly separates the events (an
  infinite maximum-likelihood estimate) produces a warning, not a silent
  number. Readable errors for a missing header, negative times, no events,
  unknown columns and event codes the tool cannot read.
- `page.test.mjs` checks the disclaimer, the FAQ markup against the visible
  text, labels on every control, no network calls in any shipped file, and
  that the example is the bundled file byte for byte.

Not checked against R's `survival` package (no R in the session where it was
built). R's default band is on the log scale, not log(-log), and R's
`cox.zph` since version 3.0 computes the exact rather than the approximate
proportional-hazards test, so those two outputs will differ from R by design.
The DOIs in `PAPERS` and on the page could not be resolved from the build
session (the proxy blocked doi.org); the Greenwood (1926) and Mantel (1966)
entries link a scholar search rather than a guessed URL.

## Method and citations

Implemented from the papers' mathematics (`PAPERS` in `engine.mjs`, printed by
`node cli.mjs --help` and `platform/agents/tools.mjs describe survival-analysis`):

- Kaplan & Meier (1958), *JASA* 53(282): the product-limit estimator.
- Greenwood (1926): its variance; bands on the log(-log) scale.
- Mantel (1966), *Cancer Chemotherapy Reports* 50(3): the log-rank test.
- Cox (1972), *JRSS B* 34(2): proportional hazards and the partial likelihood.
- Efron (1977), *JASA* 72(359): tied event times.
- Grambsch & Therneau (1994), *Biometrika* 81(3): the proportional-hazards test.
- Harrell et al. (1982), *JAMA* 247(18): the concordance index.

## Limits

Right-censored data only, every subject starting at 0. Assumes censoring is
independent of outcome. Not modelled: late entry, time-varying covariates,
strata, competing risks, frailty, interval censoring, weights, parametric
models. Bands, tests and Wald intervals are large-sample approximations;
concordance is in-sample.

## Licence and disclaimer

MIT licence (`LICENSE`). **No warranty.** Statistical estimates from the data
you supply; not medical, legal, tax or financial advice, and not a substitute
for a statistician. Not affiliated with the authors of the cited papers.
