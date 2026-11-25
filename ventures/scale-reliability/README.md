# Scale reliability: Cronbach's alpha, McDonald's omega and item analysis

**Is my questionnaire scale reliable, and which items pull it down?** Paste a survey or
test (one row per respondent, one column per item) and get Cronbach's alpha with its
confidence interval, McDonald's omega with a bootstrap interval, Guttman's lambda-2 and
lambda-6, and an item-by-item analysis: corrected item-total correlations, alpha and omega
if each item is deleted, one-factor loadings, and a check for reverse-keyed items you
forgot to reverse. It also gives the standard error of measurement and, by the
Spearman-Brown formula, how many items a target reliability would take.

**Live:** https://marisstella.app/scale-reliability/ (runs in the browser; nothing is uploaded)

```
node cli.mjs data/phq9-nhanes-2017-2018.csv
node cli.mjs answers.csv --reverse q3,q7 --scale-min 1 --scale-max 5 --missing 99 --json
node platform/agents/tools.mjs call scale-reliability analyze --input '{"csv":"q1,q2,q3\n4,5,4\n3,3,4\n2,2,1\n5,4,5","bootstrap":0}'
```

Statistical estimates from the answers you supply. **No warranty**; not medical,
psychological, legal, tax, financial or professional advice. A reliability coefficient
describes a score across a group of respondents and says nothing about any one person.

## What it reports

| Output | What it is |
| --- | --- |
| Cronbach's alpha | k/(k-1) (1 - sum of item variances / total variance), with the Feldt, Woodruff & Salih (1987) F interval and a BCa bootstrap interval |
| McDonald's omega | (sum of loadings)^2 / ((sum of loadings)^2 + sum of unique variances) from a one-factor model fitted by unweighted least squares (minres), with a BCa bootstrap interval (Kelley & Pornprasertmanit 2016) |
| Guttman's lambda-2, lambda-6 | lower bounds to reliability; lambda-2 is never below alpha |
| Standardised alpha and omega | the same for z-scored items (from the correlation matrix) |
| Item table | mean, SD, missing count, item-rest correlation, alpha if deleted, omega if deleted, raw and standardised loadings |
| Dimensionality hints | eigenvalues of the correlation matrix, the one-factor root mean square residual, and the item pair the factor explains worst |
| Score | total-score mean and SD, standard error of measurement, Spearman-Brown item counts for 0.7, 0.8 and 0.9 |

Warnings name items that correlate negatively with the rest (likely reverse-keyed), a
second eigenvalue above 1 that is more than a third of the first, a poor one-factor fit, a
Heywood case, rows dropped for missing answers, and small samples.

## Example data

The 9 items of the PHQ-9 depression screener answered by the first 1,500 respondents of
NHANES 2017-2018 (a US government public-use file, public domain; `data/SOURCE.md`, built
by `data/build_example.py` with a standard-library SAS XPORT reader and cross-checked
against pandas). Result: alpha 0.824 (95% CI 0.810 to 0.837), omega 0.838, lambda-2 0.837;
the weakest item is the self-harm question (item-rest r 0.32), which almost nobody endorses
(mean 0.04 on 0 to 3). Unweighted, so it describes these respondents, not the US
population; the totals are not screening results.

## Verification

- **Against other software** (`eval/reference.py` writes `eval/reference.json`; pingouin
  0.7.0, factor_analyzer 0.5.1, scipy 1.17.1, numpy 2.4.6). On the bundled answers:
  alpha matches `pingouin.cronbach_alpha` to 1e-12 and its Feldt interval matches pingouin's
  printed (3-decimal) interval and scipy's F quantiles to 1e-9; standardised loadings match
  factor_analyzer's `method="minres"` to 1e-5 and the standardised omega to 1e-6; the raw
  omega matches a scipy BFGS minimisation of the same least-squares loss on the covariance
  matrix (a different algorithm from the engine's iterated principal axes) to 1e-7;
  lambda-2, lambda-6, standardised alpha, eigenvalues, item-rest correlations and alpha if
  deleted match numpy to 1e-10 or better. These libraries were run only to produce the
  reference file; none of their code is in the tool.
- **Properties.** Tests check that alpha <= lambda-2 on random data, that alpha and omega
  are unchanged when every item is shifted and rescaled together, that standardised alpha
  and omega are unchanged when one item is rescaled, that 20,000 respondents on six parallel
  items recover the reliability they were simulated with (k/(k + error variance)) to 0.01,
  that the one-factor fit recovers known loadings from an exact covariance matrix, that a
  flipped item is flagged and reversing it restores alpha exactly, and that the bootstrap is
  reproducible from its seed.
- **Coverage by simulation** (`node eval/coverage.mjs`, seeded; `eval/coverage.json`):
  draws 300 data sets per setting (6 items, one common factor, normal answers, 300 bootstrap
  resamples each) and scores each 95% interval against the true reliability of the total score:

  | loadings | n | true reliability | population alpha | mean alpha | mean omega | Feldt (alpha) | BCa (alpha) | BCa (omega) |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | all 0.6 | 50 | 0.771 | 0.771 | 0.762 | 0.769 | 94.7% | 93.7% | 93.3% |
  | all 0.6 | 200 | 0.771 | 0.771 | 0.766 | 0.767 | 92.3% | 91.0% | 90.7% |
  | all 0.6 | 1000 | 0.771 | 0.771 | 0.771 | 0.771 | 95.3% | 93.7% | 93.7% |
  | 0.2 to 0.9 | 50 | 0.771 | 0.734 | 0.722 | 0.767 | 93.3% | 88.0% | 94.7% |
  | 0.2 to 0.9 | 200 | 0.771 | 0.734 | 0.731 | 0.770 | 73.0% | 68.0% | 92.7% |
  | 0.2 to 0.9 | 1000 | 0.771 | 0.734 | 0.733 | 0.771 | 11.3% | 11.3% | 94.3% |

  With 300 draws the standard error of a coverage near 95% is about 1.3 points. With equal
  loadings every interval is within about 5 points of 95% (90.7% to 95.3%). With unequal loadings alpha is
  aimed at 0.734, not the true 0.771, so its intervals close in on the wrong number as the
  sample grows: they cover the true reliability 93% of the time at n = 50, 73% at 200 and 11%
  at 1,000. Omega's BCa interval stays at 93 to 95%.
- Page tests check the disclaimer, labels, JSON-LD against the visible FAQ, no network calls,
  that every id the script uses exists, that the example is the bundled file verbatim, that
  every paper in `PAPERS` has BibTeX on the page, and that the page's coverage table is
  `eval/coverage.json`.

## Conventions, and where other software differs

- **Missing answers**: listwise deletion, as SPSS's RELIABILITY and pingouin's default do.
  psych's `alpha()` uses pairwise covariances by default, so it can differ on data with
  missing answers (not on complete data).
- **Omega** here is McDonald's model-based omega total from a least-squares (minres) one-factor
  fit of the covariance matrix, the scale of the raw total score. psych's `omega()` fits the
  correlation matrix (our "standardised omega") and divides by the observed total variance
  rather than the model's; that variant is in the JSON as `omega.observedDenominator`. JASP and
  MBESS fit a CFA by maximum likelihood, which can differ in the third decimal.
- **Lambda-6** is computed on the covariance matrix (the raw total); psych's `G6(smc)` uses
  correlations.
- **Reversal** recodes an answer x as min + max - x, with min and max the scale's lowest and
  highest possible answers if given, otherwise the lowest and highest answers seen across
  all items.

## Method

Cronbach (1951); Guttman (1945); McDonald (1999); Feldt, Woodruff & Salih (1987); Kelley &
Pornprasertmanit (2016); Efron (1987); Sijtsma (2009); Spearman (1910) and Brown (1910).
Full references are in `engine.mjs` (`PAPERS`) and on the page with BibTeX. Implemented
from the papers' mathematics; no third-party code was ported.

Not modelled: multi-factor and hierarchical omega, the greatest lower bound, ordinal
(polychoric) coefficients, correlated errors, item response theory, survey weights, and
test-retest or inter-rater reliability (for raters, see
[`inter-rater-agreement`](../inter-rater-agreement/)).

## Files

`engine.mjs` (all statistics), `cli.mjs`, `index.html`, `example-data.mjs` (the CSV,
verbatim), `coverage-data.mjs` (`eval/coverage.json` for the page), `usage.mjs` (local-only
counters with an opt-out), `data/`, `eval/`.

FSL-1.1-MIT licence.
