# Heckman sample-selection model

A wage exists only for people in paid work, a loan's loss only for loans that
were approved, a test score only for students who sat the test. If whatever
decides who is selected also moves the outcome, a regression on the selected
rows describes them and not the population, and more data does not fix it.
The Heckman model fits an equation for who is selected beside the outcome
equation, lets their unobserved parts be correlated (rho), and corrects for
it. This tool runs the standard toolkit on one page and says in words what
the numbers mean:

- The **selection probit**, **OLS on the selected rows** for comparison,
  **Heckman's two-step** estimator with the Heckman (1979) / Greene (1981)
  corrected standard errors, and **full maximum likelihood** of the
  bivariate-normal model (Heckman 1974), side by side.
- **Conventional, robust (sandwich) or cluster-robust** standard errors for
  OLS and maximum likelihood.
- **rho, sigma and lambda = rho x sigma** with intervals (rho's and sigma's
  transformed from atanh rho and log sigma so they stay in range), and three
  tests of rho = 0: likelihood ratio, Wald on atanh rho, and the two-step
  t-test on the inverse Mills ratio.
- The checks that decide whether to trust a correction (Puhani 2000): is
  there an **exclusion restriction** (a variable in selection but not the
  outcome), and the **R² of the inverse Mills ratio on the regressors**;
  plus warnings for a two-step rho outside [-1, 1], near-perfect prediction
  of selection, |rho| at the boundary, a likelihood with two peaks, and few
  clusters. A histogram of fitted selection probabilities on the page.

**Live:** https://marisstella.app/heckman-selection/ (runs in your browser;
nothing is uploaded).

## Use it

```
node cli.mjs --example
node cli.mjs data.csv --outcome log_wage --regressors educ,exper,exper_sq,region \
  --selection kids_under6,kids_6_18,other_income [--selected works] \
  [--se conventional|robust|clustered] [--cluster county] [--estimator mle|twostep] \
  [--selection-only] [--alpha 0.05] [--csv|--json]
node platform/agents/tools.mjs call heckman-selection analyze --input '{"csv":"...","outcome":"y","regressors":"x1,x2","selection":"z1"}'
```

Input: one row per unit, selected or not. Without `--selected`, a row is
selected when its outcome is not blank (or NA). The selection equation holds
the outcome regressors plus the `--selection` variables (`--selection-only`
uses exactly the `--selection` list). A constant is added to both equations;
text columns become indicators (baseline: the first level alphabetically);
rows missing a selection variable are dropped, and so are selected rows
missing the outcome or a regressor, each counted in a note.

## Method

Implemented from the papers; `PAPERS` in `engine.mjs` lists what was
implemented from each and every deviation (also on the page and in `--help`).
statsmodels and scipy were used only as external programs to record
reference numbers; none of their code is here. The CSV reader, distribution
functions and matrix inverse are shared with `ventures/instrumental-variables`.

- Model: selected when z gamma + u > 0; y = x beta + e seen only then;
  (u, e) bivariate normal, var(u) = 1, sd(e) = sigma, corr rho. For selected
  rows E[y | x, selected] = x beta + rho sigma lambda(z gamma), lambda(c) =
  phi(c) / Phi(c).
- Probit: Newton-Raphson with the observed Hessian and step halving, from
  the constant at Phi^-1(share selected). Complete separation (every row on
  the right side of zero) is an error; rows with |z gamma| > 8.5 are noted.
  log Phi is computed in logs far into the tail (a Lentz continued fraction
  for the normal tail), so the likelihood stays finite at z gamma = -60.
- Two-step: OLS of y on [x, lambda] in the selected rows; sigma^2 = e'e / n1
  + b_lambda^2 mean(delta), delta = lambda (lambda + z gamma); rho =
  b_lambda / sigma, set to +/-1 (and sigma to b_lambda / rho) if outside
  [-1, 1]. Covariance sigma^2 (X*'X*)^-1 [X*'(I - rho^2 D) X* + Q]
  (X*'X*)^-1 with Q = rho^2 (X*'D Z) V_gamma (Z'D X*).
- Maximum likelihood: theta = [beta, gamma, atanh rho, log sigma]; analytic
  log-likelihood and per-row scores; Hessian by central differences of the
  analytic gradient (step 1e-5 max(1, |theta_j|)). Damped Newton
  (Levenberg) steps from the two-step estimates and, separately, from OLS +
  probit with rho = 0; the higher log-likelihood is kept, and a second peak
  is reported. Conventional covariance (-H)^-1; robust H^-1 (sum g_i g_i')
  H^-1 with no small-sample factor; clustered the same with g summed within
  clusters, times G / (G - 1). LR test against the probit plus a normal
  regression on the selected rows (sigma^2 = SSR / n1).
- OLS on the selected rows: conventional s^2 (X'X)^-1 with n1 - k degrees of
  freedom, HC1 for robust, and G / (G - 1) x (n1 - 1) / (n1 - k) for
  clustered (statsmodels' conventions). All p-values and intervals use the
  normal distribution.

## Verification

`node --test *.test.mjs` (44 tests, about 5 s).

**Against statsmodels 0.15 and scipy 1.18** (`eval/reference.py` writes
`eval/reference.json`): two specifications of the example data (all
regressors with a text `region` column and three exclusion restrictions; and
two regressors with two exclusions). The largest relative differences seen:
probit coefficients 1.8e-15 and standard errors 1.9e-14 (statsmodels
`Probit`); OLS coefficients 2.5e-13 and standard errors 8.3e-15 under
conventional, HC1 and clustered errors; two-step coefficients 3.5e-13,
corrected standard errors 9.9e-15 and rho and sigma 2.3e-13 (the
Heckman-Greene covariance written separately in numpy from Greene 1981);
maximum-likelihood estimates 1.2e-8 and log-likelihood 1e-15 against an
independent scipy maximisation of a log-likelihood written with
`norm.logcdf` (the engine's analytic gradient is not used there); and
maximum-likelihood standard errors 3.4e-6 (conventional), 7.8e-6 (robust)
and 9.6e-6 (clustered) against statsmodels' numerical `approx_hess3` and
`approx_fprime` scores, which is the accuracy of those numerical second
derivatives. Tests allow 1e-9 to 1e-7 for the closed forms, 1e-7 for the
ML estimates and 2e-5 for ML standard errors.

Property tests: the analytic gradient matches finite differences of the
log-likelihood; log Phi(-10) matches the tabled value within 1e-13 and log
Phi(-60) its asymptotic series within 1e-9; on the example the correction
moves educ from 0.0745 (OLS) to 0.0840, within the interval of the true
0.085, and rho's interval covers the true 0.6; with independent errors the
tests do not reject and the two-step and ML estimates agree; leaving out the
exclusion restrictions raises the warning; robust and clustered errors move
the standard errors and not the estimates; complete separation is an error,
not a loop.

**Coverage.** `eval/coverage.mjs` redraws the example's design (without
region) 1,000 times at n = 1,000 (seed 11) in three scenarios and checks the
95% intervals for educ against the true 0.085. Output in
`eval/coverage-output.txt`:

| Scenario | Mean educ: OLS / two-step / ML | Coverage: OLS / two-step / ML | ML rho coverage | Rejects rho = 0 (LR) |
| --- | --- | --- | --- | --- |
| A. as the example, rho 0.6 | 0.0719 / 0.0851 / 0.0851 | 57.4% / 95.5% / 95.3% | 93.0% | 98.8% |
| B. rho 0 | 0.0854 / 0.0855 / 0.0855 | 94.8% / 94.2% / 94.2% | 93.8% | 6.1% (size) |
| C. no exclusion restriction, rho 0.6 | 0.0663 / 0.0854 / 0.0740 | 27.7% / 100.0% / 79.0% | 72.1% | 15.3% |

With a valid exclusion restriction both corrections are unbiased and their
intervals cover at the nominal rate, while OLS on the selected rows covers
57% of the time. With no exclusion restriction the two-step estimate is still
centred on the truth but its median interval is 0.317 wide, ten times the
0.033 of scenario A, and its rho fell outside [-1, 1] in 54.6% of draws;
maximum likelihood gives narrow intervals around a biased centre (0.074) and
covers 79%. `eval/peak-check.mjs` checks that this is the estimator and not
the optimiser: in 60 such draws the engine's maximum was above the
log-likelihood at the true parameters every time (`eval/peak-check-output.txt`),
so the likelihood is flat, not under-climbed. This is why the page warns
when there is no exclusion restriction.

## Limits

- **The exclusion restriction cannot be tested.** That a variable changes
  who is selected and has no direct effect on the outcome is an argument you
  make. Without one, identification rests on the normal distribution alone.
- **Normality matters.** Both estimators assume jointly normal errors; a
  non-normal selection error can make the correction wrong even with a good
  exclusion restriction. No semiparametric selection estimators.
- **Coefficients are for the latent outcome** (the wage offer, for
  everyone), not marginal effects on the expected outcome among selected
  rows; no marginal effects are computed.
- One binary selection rule; no panel, fixed-effects, ordered or multiple
  selection versions, no weights; two-step standard errors are the
  conventional ones only. Not checked against Stata `heckman` or R
  `sampleSelection` (neither was available in the session that built it).

## Disclaimer

No warranty. Statistical output from data you supply, under the model's
assumptions; not legal, tax, financial, medical or policy advice, and not a
substitute for a statistician or econometrician. MIT licence.
