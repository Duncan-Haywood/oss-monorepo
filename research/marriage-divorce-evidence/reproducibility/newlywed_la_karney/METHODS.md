# Los Angeles newlyweds: does observed conflict behaviour predict divorce over 12 years?

This is an independent test of the Gottman-style claim that how a couple behaves in conflict
predicts divorce. The data come from 368 newlywed couples in Los Angeles County, filmed while
discussing a disagreement in 2009–10 and followed for about 12 years, during which 145 divorced.
The question is whether trained observers' codes of that behaviour predict divorce beyond what
the spouses say about their marriage and their socioeconomic situation.

**Short answer: they do not, in this sample.** The observer codes add nothing measurable to
held-out prediction once satisfaction, socioeconomic status and the spouses' individual
vulnerabilities are known. Adding them changes the per-interval log-loss gain by −0.05 points
(95% CI −0.51 to +0.39), Harrell's C by +0.004 (−0.010 to +0.018) and the 12-year AUC by
+0.004 (−0.013 to +0.020). On their own they barely beat the baseline hazard. The best model,
which uses every input, reaches C = 0.63 (0.58–0.67) and a 12-year AUC of 0.67 (0.61–0.72).
That is modest discrimination, far from the >90% accuracy sometimes quoted for divorce
prediction.

## Data and licence

- **Source:** Smith, Block & Karney, "Baseline Predictors of Divorce", OSF project
  [hxn84](https://osf.io/hxn84), which supports "Individual, Interpersonal, and Socioeconomic
  Predictors of Divorce: A 12-Year Prospective Study". `download.sh` fetches the data
  (`osf.io/download/srdwb`), codebook, the authors' R code, the supplement and the README, and
  checks them against `SHA256SUMS`.
- **Licence:** the OSF project states none. The couple rows therefore stay out of git (`raw/`
  is ignored). This folder commits only code, aggregate tables and fitted model parameters.
- **Sample:** newlywed, different-sex, first-married couples recruited in 2009–10 from
  marriage licences in low-income Los Angeles neighbourhoods. They are mostly Hispanic (76%),
  with 11% White and 13% Black couples, and 47% of households are low income. The 368 couples
  are those whose status at the last follow-up is known; the paper excludes 63 of 431 couples
  lost to attrition. This is **not** a representative sample, and it has no weights.
- **Outcome:** couple-level status at follow-ups T2–T10 (0 together, 1 divorced). The supplement
  gives the follow-ups' mean years since baseline: 0.82, 1.57, 2.34, 4.15, 8.77, 9.94, 10.76,
  11.44 and 12.04. Per-couple dates are not public, so each interval sits at those means. There
  is no follow-up between 4.2 and 8.8 years (T5 to T6), so **a 6-year horizon is not observed**.
  Horizons are reported at 2.3, 4.2, 8.8 and 12 years.
- **Input blocks** (all measured at baseline):
  - *SES*: each spouse's education (below a bachelor's degree), household income, household
    size, low-income status, couple unemployment, financial strain, and census-tract
    unemployment and median income.
  - *Vulnerabilities*: for each spouse, substance-use problems, adverse childhood experiences,
    abuse history, top-quartile negative affect and parents' divorce.
  - *Satisfaction*: each spouse's 8-item sum (self-report).
  - *Observed*: each spouse's IFIRS positivity, negativity and effective communication, coded
    by trained observers from three videotaped discussions.
  - *Hostility*: each spouse's 14-item report of verbal and physical aggression in the last 9
    months, covering victimisation and perpetration. This is **a self-report questionnaire, not
    an observer code**, even though the paper puts it in its "couple adaptive behaviour" factor.
    The brief for this work described hostility as observer-coded; the supplement shows it is not.
- **Missing values:** 11 couples lack IFIRS codes, about 35 lack an ACE item and up to 17 lack
  a substance-use item. Models use training-fold medians. The authors used Bayesian multiple
  imputation.
- **Event timing:** 36 of the 145 divorces are first reported at a wave that followed a missed
  wave. They are placed at the reporting wave, and the missed wave counts as "together". This
  shifts some events later but does not change who divorced by 12 years. One couple reports
  divorced and later together; the first report counts, as in the authors' code.

## 1. Reproduction of the published results (`reproduce_published.py`)

The authors fit Bayesian models in Blimp. Their models use a latent couple-behaviour factor and
40 imputations. Blimp is not available here, so the descriptive checks are exact and the model
checks are frequentist approximations: maximum likelihood, an observed-score composite for the
latent factor, and mean imputation or complete cases (`reproduction_checks.csv`,
`reproduction_models.csv`).

| Check | Published | Reproduced | Verdict |
| --- | --- | --- | --- |
| Couples, divorced by T10 | 368, 145 | 368, 145 | match |
| Table S1 means/SDs (satisfaction, 6 IFIRS codes, hostility, income; 22 values) | | 22 of 22 within rounding + 0.01 | match (largest gap: husband satisfaction mean 25.85 vs 25.9) |
| Table S8 % at risk, husbands vs wives (8 values) | | 8 of 8 within 0.05 points | match |
| Table S2.1 % at risk, column headed **Included** | | 2 of 17 match | **mismatch** |
| Table S2.1, column headed **Excluded** | | 16 of 17 match | the headers appear swapped (S8 uses the same couples and matches exactly) |
| Table S11 empty-model hazards h(2)–h(10) | .031 .037 .036 .055 .182 .075 .023 .023 .024 | MLE .030 .036 .035 .054 .182 .074 .021 .022 .022; Jeffreys posterior mean .031 .038 .036 .056 .183 .076 .023 .024 .024 | match (the published values are posterior summaries) |
| Table S12 survival ORs (H sat, W sat, behaviour, H vul, W vul, SER) | 0.86, 0.97, 0.77, 1.29, **2.18**, 1.30 | mean-imputed 0.87, 0.72, 0.89, 1.33, **2.03**, 1.40; complete cases (310) 0.80, 0.93, 0.80, 1.34, **2.64**, 1.38 | approximate match: same signs; wife vulnerability is the only predictor whose CI excludes 1, as published |
| Table S6 SEM without wife vulnerability (standardised β) | −.06, −.09, −.18, .14, .08 | complete cases −.09, −.09, −.14, .14, .09 | approximate match |

The main text's own tables were not available to this session (only the OSF supplement), so
they were not checked.

## 2. Discrete-time survival models (`train_models.py`)

- **Rows:** each couple contributes one row per interval it starts married, ending at its divorce
  or at T10. That gives 2,671 couple-intervals with 145 events (by interval: 11, 13, 12, 18, 57,
  19, 5, 5, 5). The 4.6-year T5→T6 interval holds 57 events.
- **Models:** logistic hazards on period indicators plus each block. The baseline hazard (eight
  period indicators) is left effectively unpenalised: a scaler divides their scale by 100,
  so the penalty on them is about 10⁻⁴ of the usual. That scaler stays exactly exportable,
  because the engine reads only mean and scale. Without it, a shared penalty shrank the
  baseline, and every block chose the same C. The ridge (L2) penalty is tuned over C ∈ {0.0003…0.3}
  and the lasso (L1) over C ∈ {0.02…0.5}. The tree is a small regression tree on all inputs plus
  interval length, with depth and leaf size tuned.
- **Validation:** 20 repeats × 5-fold cross-validation by couple, stratified on divorce. The
  penalty is chosen inside each training fold by 3-fold couple CV on per-interval log loss.
  Metrics are computed on all 368 held-out couples per repeat and then averaged.
- **95% CIs:** 1,000 couple-bootstrap resamples of the repeat-averaged held-out predictions.
  These are paired across models, so block differences get their own CIs. They describe
  evaluation-sample uncertainty, not refitting uncertainty.
- **Metrics:**
  - per-interval log-loss gain over a constant rate and over the period-only baseline hazard;
  - Harrell's C on predicted 12-year risk, with ties at the same wave not comparable;
  - AUC at each horizon (divorced by then vs still married);
  - Brier score and Brier skill against the period-only model;
  - 12-year log-loss gain against the base rate;
  - observed/expected ratio and quintile calibration.
- **A no-information artefact:** the period-only model's AUC is 0.42–0.47 at early horizons, not
  0.5. Its predictions vary only by training fold, and a fold with more divorces leaves fewer in
  its training data. This small pessimistic bias applies to every model equally.

### Held-out results (`heldout_model_comparison.csv`)

| Model | Gain vs baseline hazard, % | Harrell's C | AUC 2.3 y | AUC 4.2 y | AUC 12 y | Brier 12 y | 12-y log-loss gain vs base rate, % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Period only (baseline hazard) | 0 | 0.50 | 0.42 | 0.43 | 0.50 | 0.239 | 0 |
| SES | 0.97 (0.15, 1.74) | 0.55 (0.51, 0.60) | 0.52 | 0.51 | 0.57 (0.51, 0.62) | 0.236 | 0.8 (−0.6, 2.1) |
| Vulnerabilities | 2.33 (0.76, 3.98) | 0.60 (0.55, 0.64) | 0.55 | 0.53 | 0.63 (0.57, 0.68) | 0.226 | 4.0 (0.9, 7.0) |
| Satisfaction | 1.68 (0.40, 2.92) | 0.56 (0.51, 0.61) | 0.53 | 0.54 | 0.57 (0.52, 0.63) | 0.231 | 2.3 (−0.1, 4.6) |
| **Observed (IFIRS)** | **0.63 (−0.07, 1.26)** | **0.53 (0.49, 0.58)** | 0.45 | 0.46 | **0.55 (0.50, 0.60)** | 0.239 | **−0.1 (−1.0, 0.7)** |
| Hostility (self-report) | 1.61 (0.10, 2.91) | 0.60 (0.55, 0.64) | 0.59 | 0.57 | 0.62 (0.57, 0.68) | 0.231 | 2.1 (−0.9, 4.8) |
| Satisfaction + observed | 1.62 (0.31, 2.89) | 0.57 (0.53, 0.61) | 0.54 | 0.54 | 0.59 (0.54, 0.65) | 0.232 | 2.1 (−0.4, 4.5) |
| SES + vul + sat | 3.00 (1.24, 4.65) | 0.61 (0.56, 0.65) | 0.56 | 0.54 | 0.64 (0.59, 0.70) | 0.221 | 5.5 (2.0, 8.6) |
| SES + vul + sat + hostility | 3.39 (1.44, 5.20) | 0.62 (0.58, 0.67) | 0.59 | 0.56 | 0.66 (0.61, 0.72) | 0.219 | 6.3 (2.7, 9.8) |
| SES + vul + sat + observed | 2.95 (1.17, 4.69) | 0.61 (0.57, 0.66) | 0.57 | 0.55 | 0.65 (0.60, 0.70) | 0.222 | 5.3 (2.0, 8.8) |
| **All inputs, ridge** | **3.42 (1.47, 5.30)** | **0.63 (0.58, 0.67)** | 0.60 | 0.57 | **0.67 (0.61, 0.72)** | **0.218** | **6.5 (2.8, 10.3)** |
| All inputs, lasso | 2.07 (0.05, 3.98) | 0.59 (0.55, 0.64) | 0.55 | 0.54 | 0.63 (0.58, 0.68) | 0.227 | 3.6 (−0.3, 7.3) |
| Small tree | 0.03 (−2.1, 2.1) | 0.54 (0.52, 0.56) | 0.51 | 0.52 | 0.56 (0.53, 0.59) | 0.237 | 0.4 (−1.0, 1.7) |

The constant-rate comparison is in the CSV. Even the period-only model gains 5.9% over a
constant, because the 4.6-year interval carries most of the events. The period-only Brier score
at 12 years is 0.239, from a base rate of 39.4%. Every model is well calibrated in the large,
with observed/expected at 12 years between 0.98 and 1.00. The ridge model's quintile
calibration at 12 years runs from predicted 0.24 vs observed 0.26 in the lowest quintile to
predicted 0.61 vs observed 0.64 in the highest (`heldout_calibration_12y.csv`).

### Block ablations (paired bootstrap, `block_ablation.csv`)

| Question | Δ gain vs baseline hazard (pts) | Δ Harrell's C | Δ AUC 12 y |
| --- | --- | --- | --- |
| **Observed interaction over SES + vul + satisfaction (the Gottman test)** | **−0.05 (−0.51, +0.39)** | **+0.004 (−0.010, +0.018)** | **+0.004 (−0.013, +0.020)** |
| Observed interaction over satisfaction alone | −0.06 (−0.73, +0.55) | +0.014 (−0.013, +0.041) | +0.020 (−0.013, +0.054) |
| Satisfaction over observed interaction alone | +0.99 (−0.02, +2.03) | +0.037 (−0.007, +0.080) | +0.042 (−0.009, +0.091) |
| Self-reported hostility over SES + vul + sat | +0.38 (−0.38, +1.15) | +0.015 (−0.001, +0.033) | +0.018 (−0.002, +0.038) |
| Hostility + observed over SES + vul + sat | +0.42 (−0.51, +1.34) | +0.019 (−0.002, +0.041) | +0.021 (−0.003, +0.046) |
| SES + vulnerabilities over satisfaction | +1.32 (+0.14, +2.70) | +0.050 (+0.011, +0.091) | +0.070 (+0.019, +0.124) |
| Lasso vs ridge (all inputs) | −1.35 (−1.86, −0.86) | −0.032 (−0.047, −0.017) | −0.039 (−0.056, −0.021) |
| Small tree vs ridge (all inputs) | −3.39 (−5.61, −1.04) | −0.086 (−0.123, −0.052) | −0.108 (−0.151, −0.066) |

What each ablation shows:

- **The Gottman test.** Observer codes add no measurable skill once SES, vulnerabilities and
  satisfaction are known. In 59% of bootstrap resamples they lower the log-loss gain.
  A small benefit cannot be ruled out: the upper limits are about +0.4 points of log loss and
  +0.02 AUC.
- **Self-report vs observation.** The self-reported hostility questionnaire adds more than the
  observer codes (ΔC +0.015, 96% of resamples positive). Its CI still just includes zero.
- **What carries the prediction.** Who the spouses are and their circumstances do:
  vulnerabilities, especially the wife's, education and income. These beat satisfaction
  clearly.
- **Model family.** Ridge beats lasso and the small tree on every metric.

### Effects per SD (`effects_per_sd.csv`)

These are odds ratios of the per-interval divorce hazard per 1 SD of each input. They come from
unpenalised logistic hazards on median-imputed, standardised inputs, with Wald 95% CIs; the
period-adjusted relationship inputs also get couple-bootstrap CIs from 500 resamples. Three
adjustment sets are reported:

- **period only:** the interval indicators alone;
- **relationship inputs:** satisfaction, the observed codes and hostility together;
- **all 31 inputs:** with about 4.7 events per parameter, those estimates are noisy.

| Input (SD) | Period only | Relationship inputs | All 31 inputs |
| --- | --- | --- | --- |
| Husband satisfaction (3.1 points) | **0.78 (0.67–0.92)**; bootstrap 0.69–0.92 | 0.90 (0.75–1.07) | 0.92 (0.75–1.12) |
| Wife satisfaction (3.5) | **0.72 (0.61–0.84)**; 0.62–0.84 | **0.76 (0.63–0.92)** | **0.81 (0.67–0.99)** |
| Husband positivity, observed (0.77) | 1.00 (0.84–1.18) | 0.93 (0.67–1.29) | 0.94 (0.66–1.32) |
| Wife positivity, observed (0.75) | 1.03 (0.87–1.22) | 1.28 (0.93–1.76) | 1.33 (0.95–1.88) |
| Husband negativity, observed (0.59) | 1.00 (0.84–1.19) | 0.86 (0.70–1.07) | 0.80 (0.64–1.00) |
| Wife negativity, observed (0.58) | 1.13 (0.96–1.34) | 1.06 (0.86–1.30) | 1.09 (0.87–1.35) |
| Husband effective communication, observed (0.89) | 0.87 (0.73–1.02) | 1.01 (0.80–1.28) | 1.10 (0.86–1.41) |
| Wife effective communication, observed (0.86) | **0.81 (0.69–0.96)**; 0.68–0.95 | 0.81 (0.65–1.01) | 0.83 (0.65–1.05) |
| Husband hostility, self-report (3.5) | **1.33 (1.15–1.53)**; 1.15–1.73 | 1.16 (0.97–1.40) | 1.16 (0.95–1.42) |
| Wife hostility, self-report (3.6) | **1.38 (1.19–1.60)**; 1.19–1.62 | 1.17 (0.96–1.42) | 1.16 (0.95–1.42) |
| Wife's parents divorced (0.50) | **1.42 (1.19–1.69)** | | **1.39 (1.14–1.68)** |

What the effects show:

- **Wife's effective communication** is the only observed code whose CI excludes 1 with period
  adjustment alone. Its point estimate holds at 0.81 when the relationship inputs are included,
  but the CI then reaches 1.01.
- **Observed negativity** shows no clear association; the Gottman "four horsemen" sit in this
  composite. Neither does observed positivity.
- **Satisfaction.** The wife's satisfaction stays associated after every adjustment.
- **Self-reported hostility** has the largest relationship-input associations.
- **Descriptively** (`divorce_by_tercile.csv`), 12-year divorce runs from 26% to 52% across
  terciles of husband-reported hostility. Across terciles of observed husband effective
  communication it is 42%, 45% and 29%. Across observed negativity terciles it hardly moves
  (40%, 38%, 39% for husbands).

## 3. App bundle

The bundle is `app/models/newlywed_la_couples.json`, written by `train_models.py` through
`bundle_export.py`.

- **Exported models** (each a `logistic_glm` except the tree):
  - period only;
  - satisfaction;
  - SES + vul + sat;
  - SES + vul + sat + observed;
  - all inputs (ridge);
  - all inputs (lasso);
  - the small tree (kind `tree`). Fitted to all data it is a single split on interval length,
    so it carries no couple information.
- **Interval scoring:** each model gives the probability of divorce within one interval. The app
  sets `period_03`…`period_10` (interval length `period_years` for the tree) and multiplies
  survival across `periods`.
- **Inputs:** plain-language descriptions. Each IFIRS code has a `self_report_proxy`: a question
  for the app ("When the two of you discuss a disagreement, how often is the husband hostile,
  critical, contemptuous…?") with five answers mapped to the sample's 10th–90th percentiles.
  Each carries the caveat that the model was **trained on trained-observer codes**, so
  self-ratings are an unvalidated approximation.
- **Other blocks:**
  - `weights`: none;
  - `abstain` rules;
  - `ood`: Mahalanobis distance on the 31 inputs, from `app/tools/ood.py`;
  - `effects_per_sd` and `block_ablation`;
  - `population_reference`: in the shape `app/population.js` reads (`horizons` in years since
    baseline, `overall` and `subgroups` with `n` and p1–p99 per horizon). It holds held-out
    12-year (and earlier) predicted risk of the all-inputs model, overall, by low-income status
    and by couple-satisfaction third, with every cell ≥ 100 couples. The bundle warns that
    percentiles outside p5–p95 rest on a handful of couples.
- **Parity:** `app/tests/newlywed.test.mjs` checks every exported model and the OOD score
  against the Python test vectors to 1e-9.

## Caveats

- **The sample.** These are 368 low-income, mostly Hispanic Los Angeles newlyweds, followed
  after attrition. They are not U.S. couples in general, and the models have not been
  externally validated.
- **Observer codes vs self-report.** The interaction inputs are expert codes of a laboratory
  discussion. A user rating their own or a partner's behaviour is measuring something else.
  The app's proxy is a rough what-if, not the model's input.
- **What the null result does not cover.** It concerns these three composite IFIRS codes in
  this sample. It does not test Gottman's specific coding systems (SPAFF, the four horsemen
  coded separately), physiological measures, or samples of middle-class couples.
- **Timing.** Interval times are sample means. A divorce reported after a missed wave is placed
  later than it may have happened. There is no follow-up between 4.2 and 8.8 years.
- **Uncertainty.** CIs are couple-bootstrap CIs on held-out predictions. They reflect
  evaluation noise, not model refitting. With 145 events, block differences below about 0.02
  AUC cannot be resolved.
- **Associations, not causes.**

## Reproduce

```sh
sh download.sh                       # fetch raw/ and check SHA-256
python3 reproduce_published.py       # section 1
OMP_NUM_THREADS=1 python3 train_models.py   # section 2-3; 30-60 min on 4 cores
cd ../../app && node --test tests/newlywed.test.mjs
```

`train_models.py` caches the held-out hazards in `raw/cv_cache_r20.npz` (git-ignored). With
`NL_REUSE_BOOTSTRAP=1`, it reuses saved bootstrap CIs only if its recomputed point estimates
match them.
