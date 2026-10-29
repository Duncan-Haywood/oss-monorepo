# Proxy tests: preregistration (SPEC §6.3)

Written 2026-10-29, **before** any model was fitted, in the same agent
session that then ran the tests. This is same-session preregistration: it
fixes the hypotheses, outcome codings, splits and decision rule in a file
before the results exist, which removes the freedom to choose them after
seeing the results, but nobody outside the session witnessed the order. The
git history of this file (committed with or before `proxy_tests.py`'s first
results) is the only external evidence. Anything added after the results is
marked **[post hoc]**.

What the analyst had seen before writing this: the GSS per-year column
availability, the ballot structure, and the unweighted marginal distribution
of CHLDIDEL by year (which showed "as many as you want" jumping from about
10-12% in 2000-2018 to 24-31% in 2021-2024). No cross-tab of any predictor
against any outcome had been computed.

## Data

GSS yearly Stata files 2000-2024 (selected columns, `raw/gss/`), adults 18+.
Weight `wtssps` (person post-stratification weight, the only weight present
in every year 2000-2024). Respondents with no `wtssps` (the 2022 and 2024
AmeriSpeak oversample frames, `sample` 12 and 14) are dropped. Design for
variance and bootstrap: stratum = (year, `vstrat`), PSU = (year, `vstrat`,
`vpsu`).

## Universe

Adults aged 18-44 at interview (both sexes, `sex` entered as a control),
asked the outcome item (valid answer present).

## Outcomes

- **Y1 (primary): ideal family size 4 or more.** `chldidel` in {4,5,6,7}
  -> 1, {0,1,2,3} -> 0. Code 8 ("as many as you want") is **excluded** from
  the primary analysis because it is not a number and its share changes with
  the 2021 mode switch. Sensitivity **S1**: code 8 counted as 1.
- **Y2: divorce law "more difficult".** `divlaw` = 2 -> 1; 1 ("easier") or
  3 ("stay as is") -> 0. The item is about the law, not about the
  respondent's own marriage; it is never described as marital permanence.
- **Y3: role norm "agree" with "better for man to work, woman tend home".**
  `fefam` in {1,2} -> 1, {3,4} -> 0. A role norm, not her own preference.

## Predictors (each a 0/1 indicator; missing -> case dropped for that test)

| id | definition |
|---|---|
| weekly | `attend` in {7 "every week", 8 "several times a week"} |
| catholic | `relig` = 2 (affiliation, any attendance) |
| political | block of two: `partyid` in {4,5,6} (Republican incl. leaners; 7 "other party" -> 0) and `polviews` in {5,6,7} (conservative) |
| rural | `xnorcsiz` in {8,9,10} (town under 10,000, small incorporated area, open country); `srcbelt` is not used because 2024 lacks it |
| intact16 | `family16` = 1 ("both own parents" at 16) |
| hunt | `hunt` in {1,3} (respondent hunts) |

Baseline (demographics-only) model: age, age², sex, `degree` (5 levels,
dummies), `region` (4 Census regions, dummies). No year term (the test years
are unseen). Each proxy model = baseline + that proxy. Every model and its
baseline are fitted and scored on the **same** rows (complete cases for that
proxy), so the comparison is like for like.

## Splits (temporal validation)

- **Split A (confirmatory):** train 2000-2012, test 2014-2018. All in-person
  interviewing; tests whether an association learned on earlier cohorts
  carries to later years.
- **Split B (exploratory, transport):** train 2000-2018, test 2021-2024
  (2021 push-to-web; 2022 and 2024 multimode). A failure here may be mode,
  not substance; not used for verdicts on its own.
- **Subgroup W (exploratory):** women 18-34, Split A, predictors weekly and
  catholic, Y1.

## Model and metrics

Weighted logistic regression (GLM binomial, `wtssps` rescaled to mean 1 in
the training set). On the test set, weighted by `wtssps`:

- AUC (weighted Mann-Whitney), model and baseline; ΔAUC = model − baseline.
- Brier score, model and baseline; ΔBrier.
- Calibration: weighted mean predicted vs observed, and calibration slope
  (weighted logistic regression of the outcome on the model's logit).
- Uncertainty: 1,000-replicate cluster bootstrap of the **test** set
  (resample PSUs within strata, with replacement), model fixed. Training
  uncertainty is not propagated; this is stated with every result.

## Hypotheses and decision rule

Confirmatory family (Split A, Y1), k = 7:

- H1 weekly: weekly attendance adds out-of-sample discrimination for Y1.
- H2 catholic: Catholic affiliation adds discrimination for Y1.
- H3 weekly > catholic: ΔAUC(weekly) − ΔAUC(catholic) > 0 (paired bootstrap).
- H4 political, H5 rural, H6 intact16, H7 hunt: each adds discrimination
  for Y1 over the demographic baseline.

Secondary confirmatory (Split A, Y2), k = 2: H8 weekly adds discrimination
for Y2; H9 ΔAUC(weekly) − ΔAUC(catholic) > 0 for Y2.

Everything else (Y3, Split B, S1, subgroup W, all Y2 tests other than H8-H9)
is **exploratory** and gets no "supported" verdict, only a description.

Verdict for a confirmatory test:

- **"insufficient data"** if the test set has fewer than 300 cases or fewer
  than 30 weighted-count-equivalent positives (unweighted positives < 30).
- **"supported out of sample"** if the lower bound of the
  Bonferroni-adjusted bootstrap interval for ΔAUC (for H3/H9: for the
  difference) is above 0 (level 1 − 0.05/k: 99.29% for the Y1 family,
  97.5% for Y2), **and** the point ΔBrier ≤ 0 (the proxy does not worsen
  calibrated accuracy).
- **"not supported"** otherwise.

A "supported" verdict says the proxy carries individual-level predictive
information in the same survey after demographic controls. It does not make
the proxy a measure of the outcome, and it says nothing about county-level
(ecological) versions of the proxy, which are not tested here and stay
`unvalidated_hypothesis` in the product.

## Results

Recorded in `data/surveys/proxy_tests.json` and `docs/survey-methods.md`
after the run; nothing above is edited after that.
