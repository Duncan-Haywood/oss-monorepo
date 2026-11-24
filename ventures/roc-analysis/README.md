# ROC analysis: ROC curves, AUC with DeLong intervals, DeLong's paired test, cut-offs

**How well does this score tell cases from non-cases, and is it better than
that one?** Paste one row per person or item with the outcome (disease or not,
fraud or not, churned or not) and one or more scores measured on the same
rows (a lab marker, a screening questionnaire, a model's predicted
probability), and the tool reports:

- the **ROC curve** of each score and its **AUC** with DeLong's interval;
- **DeLong's paired test** for every pair of AUCs and the **chi-square test**
  that all are equal (DeLong, DeLong & Clarke-Pearson 1988), the right
  comparison when the scores come from the same cases;
- **cut-offs** by Youden's J, closest to the top-left corner, a target
  sensitivity or a target specificity, and at a cut-off the **sensitivity,
  specificity, predictive values** (Wilson intervals, or Bayes' rule at a
  prevalence you give) and **likelihood ratios** (log-method intervals);
- the **partial AUC** at high specificity, McClish-standardised, with a
  stratified bootstrap interval;
- a **decision curve** (net benefit against treating everyone or no one) for
  scores that are predicted probabilities.

Live page: https://marisstella.app/roc-analysis/ (runs in the browser;
nothing is uploaded).

```
node cli.mjs data/wdbc-markers.csv
node cli.mjs study.csv --outcome disease --positive yes --scores psa,phi --lower egfr
node cli.mjs study.csv --threshold 4 --prevalence 0.05      # accuracy at "first score >= 4", PPV at 5%
node cli.mjs study.csv --csv > cutoffs.csv                  # every cut-off with sensitivity and specificity
node cli.mjs study.csv --json
```

Agents: `node platform/agents/tools.mjs describe roc-analysis` prints the
papers; `call roc-analysis analyze --input '{"y": [0, 1, ...], "scores": {"a": [...], "b": [...]}}'`
runs it, or pass `{"csv": "..."}` with optional `outcomeColumn`, `positive`,
`scoreColumns`, `direction` (`"lower"` or `{"col": "lower"}`), `threshold`,
`prevalence`, `partialFpr`, `targetSensitivity`, `targetSpecificity`,
`probabilityColumns`, `level`, `alpha`, `resamples`, `seed`.
From JavaScript: `analyze(input)`, `placements(score, y)`, `delong(scores, y)`,
`compare(d, names, level)`, `rocCurve(score, y)`, `areaUnder(points, maxFpr)`,
`cutoffs(points, opts)`, `atCut(score, y, t, opts)`, `decisionCurve(prob, y)`.

## How it works

**AUC and placements.** With m cases X and n non-cases Y, the AUC is
`P(X > Y) + P(X = Y)/2`. Midranks of the pooled sample (Tz) and within each
group (Tx, Ty) give the placement values `V10_i = (Tz_i - Tx_i)/n` and
`V01_j = 1 - (Tz_j - Ty_j)/m` in O(N log N) (Sun & Xu 2014), and
`AUC = mean(V10)`.

**DeLong.** For k scores on the same rows, `S = S10/m + S01/n` with S10 and
S01 the sample covariance matrices of the placements. One AUC's interval is
`AUC ± z sqrt(S_kk)`, clipped to [0, 1]; the paired test of two is
`z = (A_a - A_b) / sqrt(S_aa + S_bb - 2 S_ab)`; equality of all k is
`chi2 = (L A)' (L S L')^-1 (L A)` on k - 1 degrees of freedom with rows of L
`e_1 - e_j`.

**The rest.** The empirical curve has one point per distinct score ("a case
when score >= t"); the trapezoidal area under it equals the Mann-Whitney AUC.
Partial AUC is the same area for FPR in [0, e], standardised by McClish
(1989) as `0.5 (1 + (pAUC - e^2/2) / (e - e^2/2))`, with a percentile
interval from resampling cases and non-cases separately (seeded mulberry32).
Net benefit is `TP/N - FP/N * pt/(1 - pt)` (Vickers & Elkin 2006); a score
gets a decision curve when its name says it is a probability (`prob`, `risk`,
`pred`, ...) or it is listed in `probabilityColumns`, and its values lie in
[0, 1].

## What the example shows

The bundled example is 569 fine-needle aspirates of breast masses from the
UCI Breast Cancer Wisconsin (Diagnostic) data (212 malignant; CC BY 4.0;
`data/SOURCE.md`), four nuclear features and an out-of-fold probability from
a cross-validated three-feature logistic regression. From
`node cli.mjs data/wdbc-markers.csv` (500 bootstrap resamples, seed 1):

- `worst_perimeter` (AUC 0.9755) and `worst_concave_points` (0.9667) cannot
  be told apart: difference 0.0087, 95% CI -0.0058 to 0.0233, paired
  p = 0.24. Their AUC estimates are correlated 0.38.
- The cross-validated model (AUC 0.9911) beats each of them: difference
  0.0156 over `worst_perimeter` (p = 0.0001) and 0.0244 over
  `worst_concave_points` (p < 0.0001).
- `mean_texture` has the higher AUC of the two weak markers (0.776 against
  0.722 for `mean_smoothness`; paired p = 0.087), but at specificity of 90% or
  more its standardised partial AUC is the lower one (0.533 against 0.557,
  bootstrap intervals 0.504 to 0.577 and 0.527 to 0.594): the curves cross,
  and which marker is "better" depends on which part of the curve matters.
- At the Youden cut-off `cv_probability >= 0.530`, sensitivity is 93.9%
  (89.8% to 96.4%) and specificity 98.0% (96.0% to 99.0%).

These are numbers about one data set and a worked-example model, not about
breast cancer diagnosis.

## Verification

`eval/reference.py` (numpy 2.5.3, scipy 1.18.1) computes, by different
routes, the values in `eval/reference.json`, and `engine.test.mjs` checks the
engine against them on the example, Hanley & McNeil's (1982) 109 rated CT
images and a simulated three-score case with heavy ties and a lower-is-case
score:

- AUCs against `scipy.stats.mannwhitneyu` U/(mn) and the O(mn) kernel, 1e-12;
- the DeLong covariance matrices against placements computed directly from
  the definition over every case/control pair, 1e-14;
- paired z (1e-8), p-values (relative 1e-7), the chi-square (1e-7);
- the partial AUC against an independent polyline integration, 1e-12;
- Wilson intervals against `scipy.stats.binomtest(...).proportion_ci("wilson")`
  and LR+ intervals against the Simel formula, 1e-9 and 1e-6;
- net benefit at seven thresholds against the formula, 1e-12;
- Hanley & McNeil's rating data give AUC 0.8932; the paper reports 0.893.

`python3 -I eval/reference.py` regenerates the reference; `node --test
'*.test.mjs'` runs everything.

## Limits

Paired designs only (no unpaired comparison of AUCs from different samples);
Wald interval for a single AUC, which can be too narrow near 1 with few cases;
no covariate-adjusted, time-dependent or multi-class ROC, and no smoothed
curves. Cut-offs chosen on a sample are optimistic on that sample. Statistical
output from the data supplied, not medical advice and not an evaluation of a
diagnostic device.

## Credits

Methods: DeLong, DeLong & Clarke-Pearson 1988; Sun & Xu 2014; Hanley & McNeil
1982; Youden 1950; Wilson 1927; Simel, Samsa & Matchar 1991; McClish 1989;
Vickers & Elkin 2006 (`PAPERS` in `engine.mjs`). Implemented from the papers'
mathematics; no third-party code was ported. Example data: Wolberg,
Mangasarian, Street & Street 1993, UCI Machine Learning Repository, CC BY 4.0.
FSL-1.1-MIT licence.
