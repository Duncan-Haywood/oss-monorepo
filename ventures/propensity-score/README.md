# Propensity score analysis

People who join a training programme, patients a doctor puts on a drug,
customers who switch on a feature: they differ from the rest in ways that
also drive the outcome, so the raw difference in means mixes the effect with
who chose it. If the covariates you measured before treatment include every
common cause of treatment and outcome, the **propensity score** (each unit's
chance of treatment given those covariates) lets you compare like with like.
This tool runs the four standard estimators side by side and the checks a
reviewer asks for:

- A **logistic propensity model** (maximum likelihood; text covariates become
  indicators).
- **Inverse probability weighting** (normalised weights) for the **ATE**,
  **ATT** and **ATC**.
- **Regression adjustment**: a linear outcome model in each arm, averaged
  over the target group.
- The **doubly robust AIPW** estimate of the ATE (Robins, Rotnitzky & Zhao
  1994), consistent if either model is right.
- **1:1 nearest-neighbour matching** on the logit of the score with a 0.2 SD
  caliper (Austin 2011), with replacement and the Abadie & Imbens (2006)
  variance by default, or greedy without replacement.
- Standard errors for IPW, regression adjustment and AIPW from the **stacked
  estimating equations** (sandwich), so they include the noise of the
  estimated score (Lunceford & Davidian 2004).
- Diagnostics: **standardised mean differences** before and after weighting
  and matching with a love plot (Austin 2009), variance ratios, an **overlap**
  histogram, **effective sample sizes** (Kish), and **trimming** to scores in
  [0.1, 0.9] (Crump, Hotz, Imbens & Mitnik 2009) or a range you choose.

**Live:** https://marisstella.app/propensity-score/ (runs in your browser;
nothing is uploaded).

## Use it

```
node cli.mjs --example
node cli.mjs data.csv --treatment trained --outcome earnings \
  --covariates age,education,prior_earnings [--estimand ate|att|atc] \
  [--trim none|crump|0.05] [--caliper 0.2] [--no-replace] [--alpha 0.05] \
  [--csv|--scores|--json]
node platform/agents/tools.mjs call propensity-score analyze --input '{"csv":"...","treatment":"trained","outcome":"earnings","covariates":"age,education"}'
```

Input: one row per unit; the treatment column is 0/1 (or yes/no, true/false,
treated/control); covariates are numeric or text.

## Method

Implemented from the papers; `PAPERS` in `engine.mjs` lists what was
implemented from each and every deviation (also on the page and in `--help`).
statsmodels (BSD-3) was used only as an external program to record reference
numbers; none of its code is here.

- Propensity model: logistic regression by Newton-Raphson with step halving,
  converged to a relative step of 1e-12; near-separation (a linear predictor
  beyond 25) and scores outside [0.01, 0.99] are reported.
- IPW: weights 1/e and 1/(1-e) (ATE), 1 and e/(1-e) (ATT), (1-e)/e and 1
  (ATC), normalised within each arm.
- Regression adjustment: OLS of the outcome on the covariates in each arm;
  each arm's prediction averaged over everyone (ATE), the treated (ATT) or the
  controls (ATC).
- AIPW: mu_a = mean of m_a(x) + 1{D = a}(y - m_a(x)) / P(D = a | x).
- Standard errors: theta stacks the two potential-outcome means, the outcome
  models' coefficients and the logistic coefficients, and the covariance is
  A^-1 B A^-T / n with A the Jacobian of the mean estimating function
  (central differences) and B the mean outer product. The effect's SE is that
  of mu_1 - mu_0.
- Matching: on the logit of the score, nearest unit in the other arm within
  the caliper, ties to the lower row. With replacement the variance is
  (1/N^2) [sum (diff_i - tau)^2 + sum over matched units of K(K - 1) sigma^2],
  with K the times a unit is used and sigma^2 half the squared outcome
  difference to its nearest neighbour in its own arm (Abadie & Imbens 2006).
  Without replacement, units hardest to match go first and the SE is the
  paired one.
- Balance: SMD = (mean_T - mean_C) / sqrt((s_T^2 + s_C^2) / 2), the
  denominator always the unweighted pooled SD, flagged above 0.1.

## Verification

`node --test *.test.mjs` (57 tests, under 2 s).

**Against statsmodels 0.15.0** (`eval/reference.py` writes
`eval/reference.json`): three covariate specifications of the example data
(all five covariates, two, and earnings only). For every specification the
logistic coefficients agree within 1e-10 and their SEs within 1e-8; the IPW
and regression adjustment estimates for the ATE, ATT and ATC and the AIPW
ATE, with both potential-outcome means, agree within 1e-9, and every standard
error within 1e-6 (the largest gap seen was 1.7e-7, from statsmodels' own
numerical derivative). statsmodels documents that these standard errors
match Stata's `teffects`.

**Coverage.** `eval/coverage.mjs` redraws the example's design 1,000 times
at n = 2,000 (seed 7) and checks the 95% intervals against the population
effects (ATE 1.3372 from the design, ATT 1.6619 from a one-million-unit draw).
Output in `eval/coverage-output.txt`:

| Estimator | Mean estimate | Bias | Coverage | Mean CI length |
|---|---|---|---|---|
| IPW, ATE | 1.3160 | -0.0212 | 92.5% | 1.383 |
| Regression adjustment, ATE | 1.3332 | -0.0040 | 94.3% | 0.830 |
| AIPW, ATE | 1.3346 | -0.0026 | 94.0% | 0.870 |
| IPW, ATT | 1.6571 | -0.0048 | 93.4% | 1.047 |
| Regression adjustment, ATT | 1.6540 | -0.0078 | 94.6% | 0.846 |
| Matching with replacement, ATT | 1.6581 | -0.0038 | 95.2% | 1.398 |
| Matching without replacement, ATT | 1.1291 | -0.5328 | 54.0% | 1.119 |

The Monte Carlo standard error of each coverage figure is about 0.7 points.
Greedy matching without replacement runs out of good controls where scores
are high (727 treated against 1,273 controls, and few controls with high
scores), so later treated units get worse partners or none, and the
treated units dropped by the caliper are the ones with the largest effects.
That is why it is an option, not the default. IPW is unbiased here but has
the widest intervals and slightly low coverage, a known cost of weights near
the edges.

Property tests: in a randomised design every estimator agrees with the raw
difference; with a noiseless linear outcome regression adjustment and AIPW
recover the effect exactly for all three estimands; with a wrong (linear)
outcome model for an exponential curve, AIPW stays unbiased over 30 draws
while regression adjustment is off by about 0.2; ATT weights give treated
units weight 1 and balance every covariate; matching pairs, caliper drops,
reuse and the ATC direction are checked on a hand-built case.

## What the example shows

2,000 simulated people (`data/SOURCE.md`); 727 joined. The raw comparison
says training **lowered** earnings by 3.62 thousand dollars, because the
people who joined were younger, less schooled, more often unemployed and
lower earners. Adjusting for the five covariates:

- ATE: IPW 0.818, regression adjustment 0.899, AIPW 0.886 (95% CI 0.464 to
  1.308). The sample's true ATE is 1.333, so this draw lands low: the IPW
  interval covers it, the regression adjustment and AIPW intervals end just
  under it. The coverage study above says this happens in about 6% of draws.
- ATT: IPW 1.489, regression adjustment 1.243, matching 1.138; all three
  intervals cover the true 1.644. The ATT exceeds the ATE because the effect
  is larger for the unemployed and low earners, who joined more.
- Balance: the largest SMD falls from 0.565 to 0.029 under the ATE weights
  and to 0.062 after matching. Effective sample sizes: 458 of 727 treated,
  1,064 of 1,273 controls.
- Leaving out earnings and unemployment (`--covariates age,education_years`)
  keeps every estimate between -3.34 and -2.69: those two covariates
  balance to within 0.01 under the weights, and the answer is still wrong, because the confounders are not in
  the model. No diagnostic on this page can detect that.

## Limits

Binary treatment at one time point; main-effects logistic and linear models
(add squares or interactions as columns); AIPW for the ATE only; matching is
1:1 without bias correction, and its variance does not count the estimated
score (Abadie & Imbens 2016). No clustered standard errors, no survey
weights, no sensitivity analysis for unmeasured confounding yet. Next: an
E-value and an omitted-variable sensitivity bound, entropy balancing
(Hainmueller 2012) and overlap weights (Li, Morgan & Zaslavsky 2018), and
AIPW for the ATT.

## Disclaimer

No warranty. Statistical estimates from data you supply; not legal, tax,
financial, medical or policy advice, and not proof of what caused an outcome.
Not affiliated with the authors of the cited papers or the statsmodels,
MatchIt, WeightIt or cobalt projects. FSL-1.1-MIT licence.
