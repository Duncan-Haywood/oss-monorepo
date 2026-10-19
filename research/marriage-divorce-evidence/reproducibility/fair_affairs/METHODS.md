# Fair's affairs surveys: marriage happiness and reported affairs

These are the two survey files behind Ray Fair, "A Theory of Extramarital Affairs",
*Journal of Political Economy* 86(1), 1978, 45–61. They add what the government surveys
lack: **how happy each person says their marriage is**. The outcome is a reported affair,
**not divorce**. Each file gets its own model bundle and app lens, labelled that way.

## Data and verification

| File | Survey | People | Any affair |
| --- | --- | --- | --- |
| `fair.csv` | *Redbook* magazine, 1974, married women | 6,366 | 2,053 (32.2%) |
| `fair_pt.csv` | *Psychology Today*, 1969, married men and women | 601 | 150 (25.0%) |

- **Source:** `download.sh` fetches both files from statsmodels' GitHub repository at tag
  `v0.14.4`. Statsmodels ships them "with permission of the author". Ray Fair also posts
  them at fairmodel.econ.yale.edu, which this session could not reach.
- **Cross-check:** the 601-person file is checked against a second, independent copy, the
  R package AER's `Affairs` via Rdatasets. `train_models.py` asserts that the two copies
  agree row by row on every variable: affairs, gender, age, years married, religiousness,
  education, occupation and rating. Both give the 25.0% any-affair share Fair reports.
- **Not committed:** checksums are in `SHA256SUMS`. The raw files stay out of git (the
  permission was given to statsmodels); only aggregate tables and fitted parameters are
  committed.
- **Population:** these are magazine readers who chose to answer a questionnaire, not
  probability samples. Many answers are banded (age, years married, affairs).

## Target, inputs and evaluation

- **Target:** any affair reported. Redbook asks about time spent in affairs (> 0 counts),
  and Psychology Today asks about the number of affairs in the past year (> 0 counts).
- **Redbook inputs:** marriage rating (1 very poor … 5 very good), age, years married,
  number of children, religiousness (1–4), education (years), own occupation and husband's
  occupation (6 groups each).
- **Psychology Today inputs:** marriage rating, age, years married, religiousness (1–5),
  education, Hollingshead occupation rank (1–7), gender, and any children.
- **Evaluation:** each person is one row. Stratified 5-fold cross-validation is repeated
  5 times for Redbook and 20 times for Psychology Today, because that file is small. The
  scores are log loss (the Bernoulli deviance), AUC and Brier score. The baseline is the
  training-fold prevalence.

| Survey | Model | Held-out log-loss gain | AUC (range over folds) | Brier |
| --- | --- | --- | --- | --- |
| Redbook | Rating only (logistic) | 8.6% | 0.687 (0.660–0.713) | 0.194 |
| Redbook | **Additive logistic** | **13.2%** | **0.744** (0.718–0.765) | 0.183 |
| Redbook | Tree, depth 3 | 11.3% | 0.722 (0.697–0.747) | 0.188 |
| Psychology Today | Rating only | 5.2% | 0.653 (0.556–0.777) | 0.176 |
| Psychology Today | **Additive logistic** | **7.2%** | **0.691** (0.591–0.775) | 0.171 |
| Psychology Today | Tree, depth 3 | 4.1% | 0.654 (0.513–0.816) | 0.177 |

The constant baseline's Brier score is 0.219 for Redbook and 0.187 for Psychology Today.
The Psychology Today gains vary widely from fold to fold (−3% to +15% for the additive
model). With 150 events, treat that lens as weak.

## What the models say (associations, not causes)

- **Share reporting an affair, by marriage rating** (Redbook, `*_affair_by_rating.csv`):
  74.7% at "very poor" (n = 99), 63.5% poor, 55.1% fair, 32.3% good and 18.1% at "very
  good" (n = 2,684). Psychology Today shows the same gradient, from 50.0% to 14.7%.
- **Additive logistic odds ratios** (`*_logistic_odds_ratios.csv`), holding the other
  inputs fixed. In Redbook: 0.49 per point of marriage rating, 0.69 per point of
  religiousness, 1.11 per year married and 0.94 per year of age. Wives in managerial or
  professional jobs have about 1.9 times the odds of wives in farm or unskilled jobs. The
  husband's occupation adds almost nothing. In Psychology Today: 0.63 per rating point,
  0.73 per religiousness point, 1.30 for men and 1.46 with children.
- **The depth-3 Redbook tree** splits first on rating (≤ 3 versus ≥ 4) and then on years
  married (above or below about 4). Its leaves run from 9.9% (very good rating, married
  under 4 years) to 70.3% (very poor or poor rating, married over 4 years).

## Limits

- The data are cross-sectional and the direction is unknown: an unhappy marriage may lead
  to an affair, or an affair may lower the rating.
- Respondents are self-selected magazine readers from 1969 and 1974. Affairs are
  self-reported and probably under-reported.
- There is no divorce outcome, so the app must not present this lens as a divorce
  estimate. The bundles say so in `target` and `abstain`.
- The models are fitted to people within the observed ranges. Out-of-range inputs and
  same-sex couples (who were not asked) get no number.

## Reproduce

```sh
sh download.sh                  # three files into raw/, checked against SHA256SUMS
pip install -r requirements.txt
python3 train_models.py         # ~10 s; CSVs here, ../../app/models/fair_*.json
node --test ../../app/tests/fair.test.mjs
```
