# Conformal Prediction Intervals Calculator

A free tool for data scientists, analysts and researchers: **paste a CSV, pick the column you want to predict
and a coverage level such as 90%, and get distribution-free prediction intervals with a finite-sample
guarantee.** If your rows are exchangeable, a new row's true value lands inside its interval at least 90% of the
time, whatever the error distribution. It compares split conformal prediction, locally weighted conformal
prediction and conformalized quantile regression (CQR), checks each on held-out rows and on repeated random
splits, and says in plain words what the numbers mean. It runs in the browser, from the command line and as an
agent call. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/conformal-prediction-intervals/

It answers: *how wide must a prediction interval be to cover 90% of new cases, with no distributional
assumption?*

## Methods and papers

| Method | Paper | Implemented |
| --- | --- | --- |
| Split conformal around ridge regression | Lei, G'Sell, Rinaldo, Tibshirani & Wasserman (2018), "Distribution-Free Predictive Inference for Regression", *JASA* 113(523):1094-1111, [doi:10.1080/01621459.2017.1307116](https://doi.org/10.1080/01621459.2017.1307116) | Algorithm 2; score \|y - mu(x)\|; interval mu(x) +/- Q |
| Locally weighted split conformal | Lei et al. (2018), Section 5.2 | score \|y - mu(x)\| / rho(x), rho a ridge fit of out-of-fold \|residuals\|, floored at 10% of their mean |
| Conformalized quantile regression (CQR) | Romano, Patterson & Candès (2019), "Conformalized Quantile Regression", NeurIPS 32, [arXiv:1905.03222](https://arxiv.org/abs/1905.03222) | score max(q_lo(x) - y, y - q_hi(x)); interval [q_lo - Q, q_hi + Q]; crossed quantiles swapped per row |
| Linear quantile regression (for CQR) | Koenker & Bassett (1978), "Regression Quantiles", *Econometrica* 46(1):33-50, [doi:10.2307/1913643](https://doi.org/10.2307/1913643) | exact: dual LP solved with a two-phase bounded-variable simplex; coefficients are the optimal multipliers |
| Conformal framework and validity | Vovk, Gammerman & Shafer (2005), *Algorithmic Learning in a Random World*, Springer, [doi:10.1007/b106715](https://doi.org/10.1007/b106715) | split (inductive) conformal only |
| Ridge base model | Hoerl & Kennard (1970), *Technometrics* 12(1):55-67, [doi:10.1080/00401706.1970.10488634](https://doi.org/10.1080/00401706.1970.10488634) | standardised features, unpenalised intercept, penalty by 5-fold CV |

The calibrated quantile Q is the k-th smallest of the n calibration scores with **k = ceil((n+1)(1-alpha))**,
computed with a guard so that, for example, n = 9 at 90% gives k = 9 and not 10 from floating-point round-up. If
k > n the interval is infinite and the result says so, with the smallest calibration size that would give a
finite one.

Deviations from the papers are listed in the engine's `PAPERS` constant: linear base models (not forests or
neural networks), the spread floor, quantile swapping, and subsampling to 4,000 training rows for the quantile
fits. Everything was written from the papers' mathematics; no third-party code was ported.

The rows are shuffled with a seed and split into training, calibration and test parts (default 50/25/25).
Coverage and width are measured on the test rows, then the whole procedure is repeated on 20 further random
splits (`repeats`) and averaged, because one test set of ~100 rows moves several points by chance.

## Use it

**Browser:** open `index.html` through any static server. "Load example" uses the real diabetes data below.

**Command line** (Node 18+, no dependencies):

```sh
node cli.mjs data/diabetes.csv --target Y --coverage 0.9 --method all
node cli.mjs data.csv --method cqr --json
cat data.csv | node cli.mjs --coverage 0.95 --new new-rows.csv
node cli.mjs --help        # options and citations
```

**Agents:** from the repository root,

```sh
node platform/agents/tools.mjs describe conformal-prediction-intervals
node platform/agents/tools.mjs call conformal-prediction-intervals analyze
node platform/agents/tools.mjs call conformal-prediction-intervals analyze --input '{"coverage":0.95,"method":"cqr"}'
node platform/agents/tools.mjs call conformal-prediction-intervals analyze --stdin < data.csv
```

`analyze(input)` takes `{ csv, target, features, coverage, method, seed, testFraction, calibrationFraction,
repeats, folds, newRows }` and returns per-method held-out coverage and width, the calibrated quantile and its
rank, an interval for every test row, intervals for `newRows` (objects, arrays or CSV text with the feature
columns), the repeated-split averages, warnings, and a plain-language `summary`. With no input it runs on the
first 100 rows of the diabetes data.

## Example data

`data/diabetes.csv`: the diabetes data of Efron, Hastie, Johnstone & Tibshirani (2004), "Least Angle Regression",
*The Annals of Statistics* 32(2):407-499: 442 patients, ten baseline variables, and Y, disease progression one
year later. Source URL, retrieval date (2026-10-20), checksum and licence notes are in
[`data/SOURCE.md`](data/SOURCE.md).

## Verification

`node --test` in this directory runs 45 tests (engine, CLI, page, usage). What they check, against what reference:

- **Quantile rank:** `quantileIndex(n, alpha)` equals `floor(((n+1)p + q - 1)/q)` computed in integers for
  coverage p/q in {1/2, 2/3, 3/4, 4/5, 9/10, 19/20, 39/40, 99/100} and every n from 1 to 400; hand cases
  (n = 9 at 90% gives 9; n = 8 gives 9 > 8, infinite).
- **Exact coverage of the rank:** with uniform scores, the k-th of n covers a new score with frequency k/(n+1)
  (20,000 seeded draws for each of three (n, alpha) pairs, within 0.008).
- **Ridge:** against the closed-form normal equations on a 3 x 2 problem solved by hand (beta = [7/8, 11/8]
  at lambda = 1; [1, 2] at lambda = 0), and against a direct solve of the standardised penalised problem.
- **Quantile regression:** recovers 2 + 3x1 - x2 exactly (to 1e-7) on noiseless data at tau = 0.05 to 0.95;
  recovers the known noise quantile line on near-noiseless data; equals a brute-force minimum over every
  exact-fit line (n = 15) and plane (n = 12) to 1e-8; on the diabetes data no random perturbation of the fit
  lowers the pinball loss, and the intercept subgradient condition #{r<0} <= tau n <= #{r<=0} holds.
- **Coverage property** (n_train = 100, n_cal = 99, n_test = 200, alpha = 0.1, 200 seeded repetitions; the
  theory says the average is in [0.900, 0.910]). Actual output:

  | Noise | Split: coverage / width | Locally weighted | CQR |
  | --- | --- | --- | --- |
  | spread linear in a feature | 0.9041 / 6.715 | 0.9018 / 6.043 | 0.9034 / 5.993 |
  | spread proportional to \|x1\| (V-shape) | 0.8985 / 5.940 | 0.8986 / 6.104 | 0.9000 / 6.562 |
  | normal, constant | 0.8986 / 3.394 | 0.8995 / 3.421 | 0.8996 / 3.611 |
  | skewed (centred exponential) | 0.9006 / 3.007 | 0.9005 / 3.042 | 0.8967 / 3.278 |

  Every method stays within 0.01 of the band. Where the spread is linear in a feature the adaptive methods are
  about 10% narrower; where it is V-shaped in a feature, a linear spread model cannot follow it and they are no
  narrower (one of the stated limits).
- **CSV parsing:** header detection, tab and semicolon delimiters, quoted fields, rows with missing values
  dropped and counted, non-numeric columns rejected with the line and value when selected and left out (with a
  warning) by default, field-count and duplicate-header errors.

**Diabetes data, 90% coverage, default settings** (`node cli.mjs data/diabetes.csv`, seed 1: 220 training, 111
calibration, 111 test rows; k = 101 of 111; ridge lambda 0.1 chosen by CV), actual output:

| Method | Test coverage | Mean width | Calibrated quantile | Average coverage, 20 splits | Average coverage / width, 200 splits |
| --- | --- | --- | --- | --- | --- |
| Split conformal (ridge) | 90.1% (100/111) | 182.0 | 91.01 | 88.9% | 90.4% / 185.8 |
| Locally weighted split conformal | 89.2% (99/111) | 177.6 | 1.946 | 88.5% | 90.4% / 183.5 |
| CQR | 93.7% (104/111) | 180.7 | 1.337 | 89.1% | 90.2% / 186.8 |

Over 200 random splits the averages (0.9039, 0.9036, 0.9023) fall inside the theoretical band [0.900, 0.909]
for n_cal = 111; the 20-split default averages are about one standard error below 0.90, as chance allows. At 95%
(k = 107 of 111) split conformal covered 95.5% of the test rows with mean width 207.9 and averaged 95.6% over 50
splits. Y ranges from 25 to 346, so a 90% interval about 180 wide is the honest answer to how predictable
one-year progression is from these ten baseline variables with a linear model.

Not verified: no comparison against another implementation's output on the same split; users have not tested it.

## Limits

- The guarantee needs exchangeable rows (no time order, drift or population shift between calibration and new data).
- Coverage is marginal (averaged over rows), not conditional on a row or subgroup.
- Base models are linear in the given features; validity does not depend on that, but width does.
- Split conformal spends rows on calibration; full and cross-conformal methods are not implemented.
- Regression only: no classification, categorical features or weighted (covariate-shift) conformal.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent: not affiliated with the authors of the cited papers, their institutions, or any software vendor.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `predict_run`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
