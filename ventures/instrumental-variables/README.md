# Instrumental variables regression

Schooling, prices, police numbers, hours of training: the regressor you care
about is often chosen, and what drives the choice also drives the outcome, so
ordinary least squares is biased however much data you have. An
**instrument** moves the regressor and has no other route to the outcome
(growing up near a college for schooling, a cost shock for price). This tool
runs the standard IV toolkit on one page and says in words what the numbers
mean:

- **OLS, two-stage least squares, LIML and Fuller** (a = 1) side by side, all
  as k-class estimators, with one or more endogenous regressors.
- **Unadjusted, heteroskedasticity-robust or cluster-robust** standard
  errors (optional small-sample factors and t/F reference distributions).
- **First-stage strength**: R², partial R², Shea's partial R², the F on the
  excluded instruments under the chosen errors, and the **effective F** of
  Montiel Olea & Pflueger (2013); F below 10 is flagged, and with one
  instrument the 104.7 threshold of Lee, McCrary, Moreira & Porter (2022).
- **Overidentification**: Sargan (homoskedastic) and **Hansen's J** from
  two-step GMM (robust or clustered).
- **Exogeneity**: Durbin, Wu-Hausman and the control-function regression test
  (the last with the chosen errors).
- The **Anderson-Rubin confidence set** for one endogenous regressor, valid
  however weak the instruments: exact under unadjusted errors (an interval,
  two rays, the whole line or empty), by test inversion under robust or
  clustered errors, with a chart of the AR statistic.

**Live:** https://marisstella.app/instrumental-variables/ (runs in your
browser; nothing is uploaded).

## Use it

```
node cli.mjs --example
node cli.mjs data.csv --outcome log_wage --endogenous education_years \
  --instruments college_nearby,tuition --exogenous experience,black,south \
  [--se unadjusted|robust|clustered] [--cluster county] [--estimator 2sls|liml|fuller] \
  [--fuller 1] [--debiased] [--alpha 0.05] [--no-constant] [--csv|--json]
node platform/agents/tools.mjs call instrumental-variables analyze --input '{"csv":"...","outcome":"y","endogenous":"x","instruments":"z1,z2","exogenous":"w"}'
```

Input: one row per unit. A constant is added; text controls become
indicators; rows with a missing value in a used column are dropped and
counted.

## Method

Implemented from the papers; `PAPERS` in `engine.mjs` lists what was
implemented from each and every deviation (also on the page and in `--help`).
linearmodels (NCSA licence) was used only as an external program to record
reference numbers; none of its code is here. Its covariance conventions were
followed so the numbers can be compared.

- X = [constant, controls W, endogenous], Z = [constant, W, instruments].
  beta(k) = A^-1 [(1 - k) X'y + k X'P_Z y], A = (1 - k) X'X + k X'P_Z X.
  OLS k = 0; 2SLS k = 1; LIML k = smallest root of det(V'M_W V - k V'M_Z V)
  for V = [y, endogenous] (Cholesky, then Jacobi eigenvalues); Fuller
  k_LIML - a / (n - L).
- Covariance: unadjusted (e'e / n) A^-1; robust A^-1 [sum xhat_i xhat_i'
  e_i^2] A^-1 with xhat = P_Z X; clustered sums xhat_i e_i within each cluster
  first. `--debiased` multiplies by n / (n - K), and by G / (G - 1) x
  (n - 1) / n when clustered, and switches to t and F distributions.
- First stage: OLS of each endogenous regressor on Z with the chosen errors;
  F = Wald / q (F(q, n - L) when unadjusted, the Wald statistic on chi2(q)
  otherwise); partial R² from the instruments and regressor with W partialled
  out; Shea's R² = (SE_OLS / SE_2SLS)² (1 - R²_2SLS) / (1 - R²_OLS) from
  unadjusted fits; effective F = pi'(Z~'Z~)pi / tr(V_pi Z~'Z~).
- Sargan n (1 - e'M_Z e / e'e); Hansen J = n g'S^-1 g at the two-step GMM
  estimate, S from the 2SLS residuals, not recentred; Durbin and Wu-Hausman
  from the projected OLS and 2SLS residuals; control-function test = Wald on
  the first-stage residuals added to OLS.
- Anderson-Rubin: regress y - b x on Z and test the instruments. Unadjusted:
  F(q, n - L), and the set solves a quadratic inequality in b exactly.
  Robust or clustered: Wald on chi2(q); the Wald statistic is a ratio of
  quadratics in b, computed from precomputed pieces at 4,001 grid points over
  the 2SLS estimate plus or minus 40 SE, and each crossing is refined by 100
  bisection steps. A set touching the grid edge is reported as open-ended.

## Verification

`node --test *.test.mjs` (96 tests, under 2 s).

**Against linearmodels 7.1** (`eval/reference.py` writes
`eval/reference.json`): three specifications of the example data
(overidentified with two instruments, just identified, and two endogenous
regressors with three instruments), each under unadjusted, robust and
clustered errors with and without the small-sample factor (18 fits). For
each: the OLS, 2SLS, LIML and Fuller coefficients and standard errors, the
LIML and Fuller k, the first-stage R², partial R², F/Wald and coefficients,
Sargan, Hansen J (with the GMM coefficients), Durbin, Wu-Hausman and the
control-function test. The largest relative differences seen: coefficients
4.8e-12, standard errors 4.1e-12, Sargan 2.8e-12, Hansen J 1.3e-12, Durbin
and Wu-Hausman 2.3e-13, control function 9.4e-12, first-stage F 3.2e-13
(tests allow 1e-9 to 1e-7). **Anderson-Rubin**: the statistic at four values
of b matches linearmodels OLS fits of y - b x (1e-8 allowed), and the set's
endpoints under all three error types match scipy 1.17.1 `brentq` roots of
the same statistic within 1.7e-13.

Property tests: 2SLS recovers a simulated effect that OLS overstates; with
no endogeneity OLS and 2SLS agree and the exogeneity tests do not reject;
with one binary instrument and no controls 2SLS equals the Wald ratio and
LIML's k is 1; the effective F equals the F under unadjusted errors and the
robust Wald statistic with one instrument; at both ends of an AR set the
statistic equals the critical value; irrelevant instruments give an
unbounded AR set and a weak-instrument warning; Fuller lies between 2SLS and
LIML; and the distribution quantiles hit textbook values.

**Coverage.** `eval/coverage.mjs` redraws the example's design 1,000 times
(3,000 people in 150 counties, seed 11) and checks the clustered 95%
intervals against the true 0.08. Output in `eval/coverage-output.txt`:

COVERAGE_TABLE

## What the example shows

3,000 simulated people in 150 counties (`data/SOURCE.md`). Ability is left
out of the file; it raises both schooling and wages. With county-clustered
errors (`node cli.mjs --example`):

- OLS says a year of school raises wages by **0.107** (SE 0.004): biased up
  by the missing ability term, and confidently wrong.
- 2SLS with a college nearby and tuition as instruments: **0.064** (SE
  0.023, 95% CI 0.019 to 0.109); LIML 0.063, Fuller 0.063. The true 0.08 is
  inside. The Anderson-Rubin set is [0.019, 0.108], close to the Wald
  interval because the first stage is strong (effective F 110.7).
- The **Sargan** test rejects (p = 0.029), although both instruments are
  valid by construction. Sargan assumes independent errors, and these are
  correlated within counties, where the instruments vary. **Hansen's J**
  with clustered errors does not reject (p = 0.14). Robust-only errors do not
  fix it (Hansen J robust p = 0.026): the clustering is what matters.
- Exogeneity: the clustered control-function test rejects that OLS is
  consistent (p = 0.046); the homoskedastic Durbin and Wu-Hausman tests say
  p = 0.007, overconfident for the same reason.
- With only `college_nearby` (`--instruments college_nearby --se robust`)
  the estimate falls to 0.017 (SE 0.029), the robust F is 75.3 and the page
  warns that with one instrument an F under 104.7 makes the t-test's 5% size
  unreliable, so the AR set [-0.046, 0.070] is the one to report. That draw
  happens to miss 0.08; the coverage study above is the fair test.

## Limits

Linear, single-equation IV. No GMM point estimates beyond the J test, no
HAC or two-way clustered errors, no weights, no panel fixed effects (add
indicators as columns). The Anderson-Rubin set is for one endogenous
regressor; with several, use the per-coefficient Wald intervals with care.
The effective F is shown against 10, not against Montiel Olea & Pflueger's
data-dependent critical values. With heterogeneous effects IV estimates a
local average treatment effect (Imbens & Angrist 1994). Next: conditional
likelihood-ratio inference (Moreira 2003), the tF adjustment of Lee et al.
(2022), and the effective F's critical values.

## Disclaimer

No warranty. Statistical estimates from data you supply; not legal, tax,
financial, medical or policy advice, and not proof of what caused an outcome.
The exclusion restriction cannot be tested from the data. Not affiliated with
the authors of the cited papers or the linearmodels, statsmodels, ivreg, AER
or ivreg2 projects. MIT licence.
