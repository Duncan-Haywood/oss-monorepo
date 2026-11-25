# Ordinal regression: what moves a rating, a Likert answer or a stage up the scale?

**Live:** https://marisstella.app/ordinal-regression/ · free, runs in the browser, nothing uploaded.

An **ordinal logistic regression calculator** for outcomes that are ordered
categories: a 1 to 5 star rating, a Likert answer from Strongly disagree to
Strongly agree, a letter grade, a pain score, a disease stage, a satisfaction
level. Paste a CSV and get:

- the **proportional-odds model** (ordered logit; McCullagh 1980, Walker &
  Duncan 1967) or the **ordered probit**, fitted by Newton-Raphson;
- every coefficient with its standard error, z, p and interval, and for the
  logit the **odds ratio** per unit and **per standard deviation**;
- the **cut-points** between levels, the **likelihood-ratio test** against no
  predictors, **McFadden's pseudo R²**, AIC and BIC;
- **Brant's (1990) test** of the proportional-odds assumption, overall and per
  predictor, with the **slopes of the separate binary logits** at each cut so
  you can see where a predictor acts differently;
- the **predicted chance of every level** at a profile you set, and along each
  predictor (a stacked chart on the page);
- **categorical predictors** (a group, a treatment arm, a plan) as dummy
  variables against a reference level you choose;
- outcome levels put in order automatically when they are numbers, numbered
  labels ("1 - Poor") or a common answer scale (agree, satisfied, frequency,
  quality, severity, likelihood, importance), and taken from you otherwise.

It answers questions like "does the workshop make people agree more, after
age?", "which lab measurements go with a higher wine grade?", "how much more
likely is a 5-star review when delivery is on time?" and "is one odds ratio
honest here, or does this predictor only matter at the top of the scale?"

## Use it

- **Browser:** open the page, paste or open a CSV, or load the wine example.
- **Command line** (Node 18+, no dependencies):

  ```
  node cli.mjs data/red-wine-quality.csv
  node cli.mjs survey.csv --levels "Never,Rarely,Sometimes,Often,Always" --reference arm=control
  node cli.mjs survey.csv --link probit --at age=30 --at arm=workshop --json
  node cli.mjs data/red-wine-quality.csv --csv > coefficients.csv
  ```

  `--help` lists every option and prints the citations.
- **Agents:** `node platform/agents/tools.mjs call ordinal-regression analyze --input '{"csv":"rating,price\n1,9\n2,7\n..."}'`,
  or `{"columns": {"rating": [...], "price": [...]}}`, or `{"rows": [{...}, ...]}`;
  the same through the MCP server.
- **JavaScript:** `analyze(input)` returns JSON with a plain-language
  `summary`; `fitOrdinal`, `brantTest`, `categoryProbs`, `orderLevels`,
  `readData`, `parseCsv`, `report` and `toCsv` are exported.

`analyze` options: `outcomeColumn`, `levels` (lowest first, array or comma
list), `predictorColumns`, `categorical` (numeric-looking columns to treat as
categories), `reference` (`{column: level}`), `at` (`{column: value}` for the
profile), `link` (`logit` or `probit`), `level` (0.95), `alpha` (0.05).

## Model

With levels 1 < 2 < … < J and predictors x,

```
P(Y <= j | x) = F(theta_j - x'beta),   j = 1 .. J-1,   theta_1 < ... < theta_{J-1}
```

with F logistic (proportional odds) or standard normal (ordered probit).
Positive beta pushes the outcome up the scale; for the logit, exp(beta) is the
factor by which one more unit multiplies the odds of being above any level.

**Fit.** The log-likelihood sums log(F(a) - F(b)) over rows, with a and b the
upper and lower cut minus x'beta; each cell probability is taken from
whichever tail keeps the subtraction accurate. Newton-Raphson uses the exact
gradient and Hessian (first and second derivatives of the log cell
probabilities), with step halving and thresholds kept in order, from the
thresholds that reproduce the marginal shares. Predictors are centred and
scaled during the fit and mapped back (covariance by the Jacobian), so the wine
example's columns, which span four orders of magnitude, fit in 5 iterations.
The covariance is the inverse observed information; intervals are Wald.

**Brant's test.** For each cut j, a binary logit of 1[Y > j] on x gives
slopes b_j and fitted pi_j. The covariance of b_j and b_l (j < l) is
(X'W_j X)^-1 X'W_jl X (X'W_l X)^-1 with W_j = diag(pi_j (1 - pi_j)) and
W_jl = diag(pi_l - pi_j pi_l). The Wald statistic of b_1 = b_2 = … = b_{J-1}
has (J - 2)K degrees of freedom overall and J - 2 per coefficient.

**Normal tails.** erfc from its all-positive series below 2 and Lentz's
continued fraction above; relative error under 1e-13 against scipy's
`norm.cdf` from -12 to 12, so the probit holds up for extreme rows.

## The example

1,599 red Vinho Verde wines (UCI Wine Quality, CC BY 4.0) graded 3 to 8 by
experts, with six laboratory measurements (`data/SOURCE.md`). The ordered
logit:

- explains the grades far better than nothing (LR chi-square 700.8 on 6 df;
  McFadden's R² 0.185); every measurement matters at p < 0.01;
- **alcohol** is the strongest: each extra percentage point multiplies the
  odds of a higher grade by 2.43 (95% CI 2.17 to 2.72). Holding the other
  five at their means, a 9.5% wine has a 59% chance of a 5; a 12.5% wine
  has a 33% chance of a 7 or 8;
- **but proportional odds fails** (Brant chi-square 92.8 on 24 df,
  p < 0.0001). Alcohol's per-cut slopes are 1.22, **0.28**, 0.89, 1.00 and
  1.17: it barely separates the 4s from the 5s (0.28 ± 0.17) while it does
  much of the work above that. Total sulfur dioxide changes sign: positive
  at the two lowest cuts, negative at the top three. Sulphates and chlorides
  pass.
- The most likely grade is the observed one for 59.2% of wines (always
  guessing 5 gets 42.6%) and within one grade for 97.1%.

These are numbers about one data set of one wine style, not advice about
wine.

## Verification

`eval/reference.py` (statsmodels 0.15.0, numpy 2.5.3, scipy 1.18.1, pandas
3.0.5) writes `eval/reference.json`, and `engine.test.mjs` checks the engine
against it on the wine data, a simulated five-point Likert survey with a
three-level group, and a simulated data set built to break proportional odds:

- log-likelihoods against statsmodels' `OrderedModel` (logit and probit)
  differ by at most 3e-12; coefficients and cut-points by 3e-8 relative
  (tests assert 1e-6); standard errors by 2e-6 relative (tests assert 1e-5;
  statsmodels takes a numerical Hessian, the engine an exact one). Cut-point
  standard errors are mapped from statsmodels' log-gap parametrisation by the
  delta method;
- predicted category probabilities against statsmodels' `predict`, 1e-7;
- Brant's statistics, p-values and per-cut slopes against a numpy
  implementation of the formula on statsmodels' binary `Logit` fits, 1e-8
  (observed 5e-11);
- on the planted violation, Brant flags `x1` (p < 1e-10) and passes `x2`;
- size: on 400 data sets simulated under proportional odds (n = 300, four
  levels, two predictors), Brant's test rejected at 5% in 6.0% and at 10% in
  11.5%;
- invariances: rescaling and shifting a predictor, reordering rows, reversing
  the scale (signs flip), and the csv, columns and rows input shapes.

`python3 -I eval/reference.py > eval/reference.json` regenerates the reference
(about 45 s); `node --test '*.test.mjs'` runs everything.

## Limits

Wald intervals (no profile likelihood); no partial proportional odds,
generalised ordered logit or multinomial fallback when Brant's test fails
(the per-cut slopes are shown instead); no interactions, random effects,
survey weights or complementary log-log link. Association, not cause.
Statistical output from the data supplied, not medical, legal or financial
advice.

## Credits

Methods: McCullagh 1980; Walker & Duncan 1967; Brant 1990; McFadden 1974;
Agresti 2010 (`PAPERS` in `engine.mjs`). Implemented from the papers'
mathematics; no third-party code was ported (the CSV reader and special
functions are shared with this repository's `roc-analysis`). Example data:
Cortez, Cerdeira, Almeida, Matos & Reis 2009, UCI Machine Learning
Repository, CC BY 4.0. FSL-1.1-MIT licence.
