# NSFG 1995–2023 pooled first marriages: per-year dissolution from the wedding day

This lens pools every NSFG cycle from 1995 to 2022–2023 to predict, year by year, whether a
first marriage ends in divorce, annulment or separation. It replaces the single-cycle 2002 lens
(`../nsfg2002_first_marriage/`) as the app's main young-couple lens. It has seven times the
marriages, weddings from 1964 to 2023 rather than 1972 to 2002, and eight new inputs fixed at
or before the wedding. The 2002 lens is kept as it was so the two can be compared.

## Headline results (held out by person, 5 folds; 95% person-bootstrap intervals)

**Sample:** 29,202 women's first marriages (8 cycles, weddings 1964–2023) with 10,529
dissolutions (8,702 divorces or annulments) over 235,174 person-years. The both-sexes analysis
adds 14,134 men's first marriages (2002–2023 files) with 4,727 dissolutions, for 43,336
marriages and 15,256 dissolutions. The 2002-only lens had 4,126 marriages and 1,492
dissolutions.

All held-out women (n = 29,202):

| Model | Deviance gain vs constant | vs duration only | Harrell's C | AUC 5 y | AUC 10 y | Decile lift | O/E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Duration only | 0.65% (0.49–0.80) | — | — | — | — | — | 1.00 |
| 2002 lens refit on 2002 data | 2.86% (2.45–3.26) | 2.23% | 0.645 (0.639–0.654) | 0.665 (0.657–0.677) | 0.649 (0.638–0.660) | 4.4 (3.9–5.2) | 0.85 |
| 2002 inputs, pooled data | 4.01% (3.60–4.39) | 3.38% | 0.661 (0.655–0.670) | 0.678 | 0.665 | 5.8 (5.0–6.8) | 1.00 |
| Additive spline GLM (all inputs) | 5.69% (5.26–6.12) | 5.08% | 0.695 (0.689–0.702) | 0.717 (0.709–0.727) | 0.718 (0.711–0.728) | 10.2 (8.9–12.0) | 0.99 |
| Spline + interaction GLM | 5.73% (5.30–6.16) | 5.12% | 0.697 (0.691–0.704) | 0.719 | 0.717 | 10.0 (8.6–12.2) | 0.99 |
| Poisson tree, depth 4 | 3.33% (2.93–3.71) | 2.70% | 0.651 (0.646–0.660) | 0.664 | 0.663 | 6.6 (5.7–7.7) | 0.99 |
| **Poisson gradient boosting** | **6.29% (5.85–6.73)** | **5.68%** | **0.703 (0.697–0.710)** | **0.724 (0.715–0.735)** | **0.725 (0.718–0.737)** | **13.5 (11.4–16.1)** | 0.98 |
| Ensemble sqrt(GLM × boosting) | 6.19% (5.76–6.62) | 5.58% | 0.702 (0.696–0.709) | 0.724 (0.715–0.734) | 0.725 (0.717–0.735) | 11.8 (10.1–14.3) | 1.00 |

**How much the extra data helped** (paired person bootstrap against the 2002 lens refit on
2002 data, same folds):

- All held-out women: boosting adds +3.43 points of deviance gain (3.12–3.75) and +0.058 in
  C (0.051–0.063). The additive GLM adds +2.83 points (2.54–3.13) and +0.049 in C. The
  2002 inputs on pooled data alone add +1.15 points (0.96–1.34) and +0.016 in C
  (0.013–0.019). About a third of the improvement is more data with the same inputs; the rest
  is the new inputs.
- The 2002 women only (the lens's own population, n = 4,126): 2.81% (1.74–3.87), C 0.630 for
  the 2002 lens; 4.10% (3.02–5.22), C 0.663 for boosting; 4.23% (3.14–5.30), C 0.664 for the
  ensemble. Paired differences are +1.29 (0.63–1.86) and +1.42 (0.89–1.91) points, and C
  +0.033 (0.020–0.046).
- **Out of time** (fit on weddings before 2000, tested on 12,460 weddings 2000–2023): 2002 lens
  4.41% (3.70–5.10), C 0.679, O/E 0.84; boosting 6.73% (6.00–7.41), C 0.713 (0.700–0.726),
  AUC10 0.741, O/E 0.99; ensemble 6.95% (6.21–7.60), C 0.716. The pooled models stay
  calibrated on later weddings (O/E 0.99–1.06). The 2002 lens predicts about 20% more dissolutions than occur.
- Decile lift: the observed dissolution rate in the riskiest tenth of held-out women is 13.5
  times that in the safest tenth for boosting (4.4 for the 2002 lens).

Both-sexes models (respondent-level inputs only, n = 43,336): additive GLM 4.74% (4.36–5.07),
C 0.675 (0.669–0.682); boosting 4.93% (4.56–5.25), C 0.676 (0.669–0.682). On men alone
(n = 14,134), 4.77% and 4.94%, C 0.671.

Sensitivity: divorce or annulment only, 6.14% (GLM) and 6.71% (boosting), C 0.701 and 0.708.
Exact-date cycles only (no imputed months), 5.69% and 6.33%, so the imputation costs nothing
measurable. Weddings 2000 onward (cross-validated), 7.04% and 7.50%. A survey-cycle fixed
effect changes the GLM's gain from 5.69% to 5.70%: no detectable cycle artefact beyond the
wedding-year cohort term. The interaction GLM gains only 0.05 points over the additive one,
so it is not exported. The engine has no interaction terms, and it is not needed.

**Rate ratios** from the final additive GLM (reference: first year, wife 23.2, husband 25.0, 4.8 years of premarital sex,
wedding 2000, other inputs at their reference levels; 95% intervals from 40 design-based
bootstrap refits resampling clusters within strata; `additive_partial_effects.csv`):

- Wife's age at the wedding: 17 → 2.63 (2.39–2.81), 19 → 2.07, 25 → 0.80, 28 → 0.60
  (0.56–0.66), 32 → 0.46.
- Wife has a bachelor's degree by the wedding: 0.63 (0.58–0.68).
- Husband has children from before: 1.35 (1.24–1.45). Husband married before: 1.26
  (1.18–1.36).
- Different race-ethnicity: 1.29 (1.25–1.40). Wife Black (vs White): 1.37 (1.28–1.45).
- Wife not raised by both parents to 18: 1.30 (1.25–1.37). Wife had a premarital birth: 1.20
  (1.10–1.28). Wife born outside the US: 0.85 (0.77–0.91).
- Years sexually active before the wedding (vs 4.8): 0 → 0.68 (0.63–0.72), 12 → 1.52
  (1.42–1.67).
- Premarital partners (vs 1): 0 → 0.83 (0.75–0.92), 2 → 1.25 (1.15–1.34), 10+ → 1.10
  (1.02–1.19). The pattern is not monotone once years of premarital sex are in the model.
- Premarital cohabitation: 1.01 (0.97–1.06). Its 2002-lens association (1.24) disappears
  once premarital sex, births and partners are adjusted for and later cohorts are added.
- Husband's age adds little once the wife's age is known (19 → 1.18, 32 → 0.97). Religion
  raised and mother's age at first birth are near 1. Mother's education BA+ gives 1.10
  (1.04–1.18).
- Duration: the hazard peaks in years 1–2 and halves by year 20 (0.52, 0.47–0.58).
  Wedding-year cohorts: 2020 vs 2000 0.82 (0.72–0.92).

These are **associations, not causes.**

Survey-weighted Kaplan–Meier (`weighted_survival.csv`): 79.4% of women's first marriages were
intact at 5 years, 66.7% at 10 and 51.8% at 20 (men 80.5%, 69.8%, 56.2%). 5-year survival
rises from 75.3% for weddings 1964–1979 to 85.0% for 2010–2023, and 10-year survival from
62.5% to 76.1%.

Population reference (held-out, app rule): the median woman's predicted chance of dissolution
is 17.8% within 5 years, 30.2% within 10 and 46.1% within 20 (10th–90th percentile at 10 years:
12.2%–58.0%). Median 10-year values: married under 20, 49.7%; 25–29, 22.0%; BA by the wedding,
15.0% vs 36.0%; weddings 2010–2023, 22.6%.

## Data and checks

Official NCHS public-use respondent files, fetched by `download.sh` from
`https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/` (and `…/NCHS/NSFG/` for
2022–2023), with layouts from the CDC `stata/` dictionaries (1995: the `sas/` setup file;
2022–2023: the CSV in the official zip). `SHA256SUMS` records the 28 files used on 2026-10-20.
NCHS publishes no checksums, so each file was checked against published facts instead
(`cycle_audit.csv`; `harmonise.py` asserts the record counts):

| Cycle | File | Records (= official) | Weighted total (millions) | Ever married | First-marriage dissolutions |
| --- | --- | --- | --- | --- | --- |
| 1995 | women | 10,847 | 60.2 | 6,844 | 2,427 (2,073 divorce/annulment) |
| 2002 | women | 7,643 | 61.56 | 4,126 | 1,492 (1,232 divorce/annulment) |
| 2002 | men | 4,928 | 61.15 | 1,754 | 691 (582 divorce/annulment) |
| 2006–2010 | women | 12,279 | 61.75 | 5,534 | 1,979 (1,574 divorce/annulment) |
| 2006–2010 | men | 10,403 | 62.13 | 3,733 | 1,217 (1,004 divorce/annulment) |
| 2011–2013 | women | 5,601 | 60.89 | 2,452 | 969 (755 divorce/annulment) |
| 2011–2013 | men | 4,815 | 60.52 | 1,684 | 583 (474 divorce/annulment) |
| 2013–2015 | women | 5,699 | 61.49 | 2,401 | 925 (756 divorce/annulment) |
| 2013–2015 | men | 4,506 | 61.16 | 1,611 | 535 (442 divorce/annulment) |
| 2015–2017 | women | 5,554 | 72.22 | 2,582 | 984 (818 divorce/annulment) |
| 2015–2017 | men | 4,540 | 71.62 | 1,770 | 600 (522 divorce/annulment) |
| 2017–2019 | women | 6,141 | 72.67 | 2,722 | 1,050 (873 divorce/annulment) |
| 2017–2019 | men | 5,206 | 72.22 | 1,961 | 699 (579 divorce/annulment) |
| 2022–2023 | women | 5,586 | 74.94 | 2,562 | 703 (621 divorce/annulment) |
| 2022–2023 | men | 4,371 | 75.7 | 1,624 | 402 (363 divorce/annulment) |

- **Record counts** equal the official public-use sample sizes in the NCHS user guides for
  every file (10,847 women in 1995 … 5,586 women and 4,371 men in 2022–2023).
- **Weighted totals** match the NCHS population figures: about 60–62 million women and men
  aged 15–44 (1995–2015 cycles) and 72–76 million aged 15–49 (2015–2017 onward). The
  2006–2010 weight is `WGTQ1Q16` (all four years).
- **Outcome codes**: 2017–2019 `MAREND01` counts are exactly the codebook frequencies
  (women 873 divorced or annulled, 177 separated, 45 widowed; men 579, 120, 19), and the
  2002 women reproduce the 2002 lens exactly (4,126 marriages, 1,492 dissolutions, 1,232
  divorces, 58 widowed). 2022–2023 `MAREND01` frequencies (631, 85, 27) match the codebook;
  21 women with a missing wedding year (`MARDAT01` = 9997) are dropped there.
- **Dates**: in the exact-date cycles `MARDAT01 + MAR1DISS` equals the dissolution or
  interview month for all but 24 of 30,139 marriages (11 of them in 1995).
- **The 2002 file is the same file the 2002 lens used.** The CDC `2002FemResp.dat` and
  `2002FemResp.dct` are byte-identical (SHA-256) to the ThinkStats copies in
  `../nsfg2002_first_marriage/SHA256SUMS`, which until now had been checked only against
  published counts.
- **Terms**: NSFG public-use data are for statistical research; users must not try to identify
  anyone. The terms do not clearly allow redistribution, so only the download script,
  checksums, code, aggregate tables and fitted model parameters are committed.

## Sample, outcome and time

- Each ever-married respondent contributes her or his **first** marriage. Women: all eight
  cycles. Men: 2002 onward (the 1995 cycle interviewed women only). The 1995 men's file does
  not exist, and the 1973–1988 cycles were not used: they interviewed only women aged 15–44
  with different marital-history layouts, and the 2002–2023 span already reaches back to
  weddings in the 1960s.
- **Event**: the first marriage ended in divorce, annulment or separation (`MAREND01` 1 or 2;
  2002 men `MAREND1`). Widowhood is censored at the death. A **divorce-only** sensitivity
  counts only `MAREND01` = 1 and censors separations at the separation date.
- **Time**: months from the wedding to the end (or the interview), placed at mid-month, split
  into marriage-years 0, 1, 2, …
- **Exact-date cycles** (1995, 2002, 2006–2010, 2011–2013, 2013–2015) give century-month dates,
  and the lens uses `MAR1DISS` as the 2002 lens does.
- **Year-only cycles** (2015–2017, 2017–2019, 2022–2023) suppress months: the public files give
  the wedding and end **years**, the exact **interview month** (`CMINTVW`) and `MAR1DISS` in
  five groups (0–12, 13–24, 25–36, 37–48, more than 48 months). `harmonise.impute_months`
  draws the wedding and end months uniformly (seeded) among the month pairs consistent with
  all three. No record was inconsistent. **Check**: coarsening the three newest exact-date
  cycles the same way and re-imputing gives durations with mean error +0.3 months (SD 4.7);
  99% are within 12 months and 73% fall in the same marriage-year. The exact-date-only rows
  of `heldout_model_comparison.csv` show the models' skill without any imputed dates.
- **Age at marriage**: exact `(MARDAT01 − CMBIRTH)/12` in exact-date cycles; `FMAR1AGE + 0.5`
  (completed years) in 2015–2017 women, 2017–2019 and 2022–2023. The 2015–2017 men's file
  suppresses both birth date and age at marriage (`HISAGEM`/`AGEMARRN` give a usable value
  for only 57 of 1,770 ever-married men), so it uses age at interview and the imputed wedding month; on 2013–2015 men, where
  the exact value is known, this proxy has mean error 0.00 years (SD 0.29, never beyond ±0.5).

## Inputs and timing (leakage) decisions

Everything below is fixed at or before the wedding, or measured in a way that cannot follow
it, except where a row says otherwise. Refused and don't-know answers are an `Unknown` level;
`Not asked` marks a cycle (or the men's files) where the question does not exist.

| Input | Source variables | Timing / harmonisation decision |
| --- | --- | --- |
| `wife_age_at_marriage` | `MARDAT01`, `CMBIRTH`; `FMAR1AGE` | see above |
| `husband_age_at_marriage` | `HXAGEMAR` (1995: husband's birth date `H1BORN`/`CHBORN`) | 2022–2023 publishes 5-year bands only: band mid-points (18.5, 22.5, 27, 32, 37, 45) are used; 1995 values outside 14–80 (impossible birth dates) set missing; missing → training median |
| `wedding_year` | `MARDAT01` | cohort term (1964–2023); a spline, so recent cohorts get their own level |
| `wife_premarital_sex_years` | `VRY1STAG` | age at marriage minus (age at first sex + 0.5), floored at 0: years sexually active before the wedding (0 if first sex at or after it) |
| `cohabited_first` | `LVTOGHX` (1995 `LVTOGH1`/`LVTOGCH`; 2022 `LVTOGHX_1`; men `PREMARW1`) | lived together before marrying this spouse |
| `husband_married_before` | `MARBEFHX` (1995 `H1MARBEF`/`CHMARBEF`) | men's files: not asked about the first wife consistently → `Not asked` |
| `husband_prior_children` | `KIDSHX` | not asked in 1995 → `Not asked` |
| `wife_race_ethnicity` | `HISPRACE` (1977 OMB); `HISPRACE2` (1997 OMB) where `HISPRACE` is absent | 4 groups |
| `same_race_ethnicity` | 2002 `HISPHX`/`RACEHX1`; 2006–2015 `HSBHRACE1`; 2015–2019 `HSBNRACE1` vs `HISPRACE2`; 1995 `H1/CH HISP, RACE0, BSTRAC` | husband's group vs the wife's on the same standard; 2022–2023 does not publish husband race → `Not asked` |
| `wife_intact_family` | `INTACT18` (1995 `INTCTFAM`) | lived with both biological or adoptive parents from birth to 18 |
| `wife_premarital_birth` | `B1PREMAR` (1995: `BABY1MO` < `MARDAT01`) | first birth before the wedding; no births → No |
| `wife_premarital_partners` | `PTSB4MAR` (1995 low end of `PTSB4MAL`) | male partners before the first marriage, banded 0, 1, 2, 3–4, 5–9, 10+ because the top-code changes (50 to 20); not in men's files |
| `wife_ba_by_wedding` | `CMBAGRAD` (2006–2015), `EARNBA_Y` (2015+), `WHENEAR1` (1995) | **education is measured at interview**, after many dissolutions, so `HIEDUC` is not used. Instead the bachelor's-degree date is compared with the wedding (same calendar year counts as by the wedding in year-only cycles). 2002 has no degree dates → `Unknown` for the whole cycle |
| `wife_mother_education` | `EDUCMOM` (1995: years of school, banded) | fixed before the wedding |
| `wife_mother_age_first_birth` | `AGEMOMB1` (bands; 1995 years and 91–94 guesses; 2022 bands 30–34/35+ merged) | banded <18, 18–19, 20–24, 25+ |
| `wife_religion_raised` | `RELRAISD` | None/Catholic/Protestant/Other; 2022–2023 does not ask it → `Not asked` |
| `wife_born_outside_us` | `BRNOUT` | |

**Left out on purpose**: highest education, current religion, religious attendance, income,
employment and metro/region of residence are all measured at interview and can follow the
dissolution. `ATTND14` (attendance at 14) is asked only of some ages in some cycles. Husband's
education (`CHEDMARN`) is missing for divorced women in 2002 (it leaks the outcome there). The
spouse items for men (first wife's age, race, marital history) live in separate current-wife
and former-wife sections that change across cycles, so they were not harmonised.

## Weights and design

NSFG final weights are rescaled within each file so they average 1 over all its respondents.
A cycle therefore counts in proportion to its sample size, and its own weighting is kept.
They are then normalised to mean 1 over the analysis sample. Fits use weight × exposure.
Strata and clusters are carried for each file (`SEST`/`SECU`, 2002 women `SECU_R`, 2022–2023
`VEST`/`VECL`). The 1995 public file has strata (`COL_STR`) but no clusters, so each 1995 woman
is her own cluster. The rate ratios' intervals come from a design-based bootstrap that
resamples clusters within strata. The model-skill intervals come from a person bootstrap, as
the brief asks.

## Models and evaluation

- **5-fold cross-validation by person** (seeded permutation): all of a person's years are in one
  fold. Every metric below is on held-out people.
- Models: constant; **duration only** (spline in marriage years); the **2002 lens refit on 2002
  training women only** (`lens2002_2002data`, same inputs and GLM as the published lens, with
  wedding year held inside 1972–2002 as the app does); the same 2002 inputs on all cycles
  (`additive_2002features_pooled`); the **additive spline Poisson GLM** with all inputs; a
  **spline + interaction GLM** (every input × marriage years, plus wife age × husband age and
  the absolute age gap; evaluated only, because the engine has no interaction terms); a
  **Poisson tree** (depth 4, ≥3,000 intervals per leaf); **Poisson gradient boosting**
  (`HistGradientBoostingRegressor`, 250 trees of depth 3, learning rate 0.05, ≥1,000 intervals
  per leaf, L2 1.0); and the **ensemble** `sqrt(rate_GLM × rate_boosting)`.
- The bundle's `models` are the duration-only baseline, the additive GLM and boosting. The app
  averages the last two (`scoring_models`). The depth-4 tree is clearly weaker held out, so
  it is exported under `extra_models` for inspection and is not averaged.
- **Deviance gain**: weighted Poisson deviance per person-year versus the constant and the
  duration-only curve.
- **Discrimination**: each person's held-out predicted cumulative hazard over the first 10
  years (5 for AUC at 5 years) from the wedding is the risk score. Survey-weighted
  **Harrell's C** over the whole follow-up; **cumulative/dynamic AUC** at 5 and 10 years with
  inverse-probability-of-censoring weights (Uno); **decile lift** = observed dissolution rate
  per person-year in the top tenth of risk ÷ the bottom tenth; **calibration** = observed vs
  predicted rate in each risk decile (`heldout_calibration_deciles.csv`). `metrics.py` is checked
  against a brute-force C on random data.
- **Intervals**: person bootstrap (1,000 draws for deviance gains, 200 for C/AUC/lift),
  folds held fixed.
- **Out-of-time**: fit on weddings before 2000 (all cycles), test on weddings in 2000 and
  later. The 2002 lens analogue is fit on 2002-cycle weddings before 2000.
- **Sensitivity**: divorce only; exact-date cycles only; weddings 2000 and later only; a
  survey-cycle fixed effect added to the GLM.

## Population reference and partner distribution (bundle blocks)

Both blocks use the layout that `app/population.js` reads and that
`app/tools/population_reference.py` writes for the NSFG 2002 lenses (same helpers and floors).

- `population_reference`: each woman's **held-out** predicted chance that her first marriage
  dissolves within 5, 10 and 20 years of the wedding. She is scored by models fitted on the
  other four person folds, with her own inputs and real wedding year. The number is the one the
  app shows for this lens: 1 − the mean, over the scoring models (`scoring_models`:
  `additive_spline` and `gradient_boosting`), of each model's survival exp(−Σ annual rates).
  `overall` and `subgroups` give `n` and survey-weighted quantiles `p1`…`p99`, each a list
  aligned to `horizons` [5, 10, 20]. Subgroups are wife's age band, husband's age band, BA by
  the wedding, race-ethnicity, cohabited first, husband married before, husband's prior
  children, intact family, religion raised, premarital birth and wedding decade, with
  `subgroup_defs` naming each column and bins. A cell needs at least 100 unweighted
  marriages; `Unknown`/`Not asked` levels are omitted. `population_reference_both_sexes` has
  the same shape for `models_both_sexes` over women's and men's marriages, with a
  `respondent_sex` subgroup. Nothing person-level is written.
- `partner_distribution`: from women's reports, weighted joint frequencies of the husband's age
  gap bin, earlier marriage, prior children, same/different race-ethnicity and premarital
  cohabitation **given the wife's** age band and race-ethnicity (`given_wife`). It also gives
  the wife's traits given the husband's age band and race-ethnicity (`given_husband`). A
  conditioning cell needs at least 30 unweighted marriages, and a partner profile at least 10.
  Kept profiles are renormalised, and `coverage` records the weighted share they cover.
  `gap_values` gives the weighted median gap in each bin. A table leaves out marriages whose
  cycle did not ask one of its traits (husband's prior children in 1995, husband's race in
  2022–2023). These are partners **observed in first marriages**, not a model of who a person
  could marry.

## Limits

- Retrospective histories from cross-sections. Marriages that dissolved long ago are reported
  by people who were still 15–44 (15–49) at interview, so long durations come from people who
  married young, and the most recent cohorts have short follow-up.
- The respondents are not couples. Women report on their husbands; for men there is nothing
  about the wife. All associations are **not causal**: who cohabits, or marries young,
  differs in ways the survey does not measure.
- Months in the year-only cycles are imputed (above). Husband age in 2022–2023 is from bands.
- Weights are pooled by sample size, not by population, and the 1995 file has no clusters.
- No relationship quality, income, or children born during the marriage. Most of what ends a
  marriage is not in these variables. Treat any single prediction as a rough base rate.

## Reproduce

```sh
sh download.sh                       # ~0.5 GB into $NSFG_RAW or ./raw; checks SHA256SUMS
pip install -r requirements.txt      # numpy, pandas, scikit-learn 1.7.2
python3 harmonise.py                 # cycle audit and harmonised category tables (~10 s)
OMP_NUM_THREADS=1 python3 train_pooled.py   # ~1-2 h on a shared 4-core box; writes the CSVs,
                                     # sample_audit.json and ../../app/models/nsfg_pooled_first_marriage*.json
node --test ../../app/tests/nsfg_pooled.test.mjs
```

Files: `nsfgio.py` (readers), `harmonise.py` (per-cycle variable maps and recodes),
`metrics.py` (C, AUC, quantiles), `train_pooled.py` (models, evaluation, export);
`cycle_audit.csv`, `sample_audit.json`, `heldout_model_comparison.csv`,
`heldout_calibration_deciles.csv`, `additive_partial_effects.csv` (rate ratios with design
bootstrap intervals), `coefficients_additive_spline.csv`, `tree_depth4.txt`,
`weighted_survival.csv`.

## 2026-10-20 extension: who she grew up with, and religion growing up (`extended_predictors.py`)

Three childhood inputs (so before every wedding), asked on the 2006–2010 to 2017–2019 files and
scored at their own "Not asked" level for 1995, 2002 and 2022–2023 women:

- `wife_family_origin`: INTACT18 (both parents to 18), LVSIT14F/LVSIT14M (step-father or another
  mother figure at 14) and PARMARR (biological parents married when she was born): both parents /
  stepfamily / never-married single parent (parents not married at her birth) / parents split up or
  a parent died (married at her birth, not intact — the public files do not separate divorce from
  death) / other;
- `wife_attend14`: attendance at 14 (ATTND14), all seven answers including "more than once a week".
  On these files it is answered by about a third of all women (4,395 of 12,279 in 2006–2010) but by
  only 1,015 of the 15,691 first-married women in 2006–2019 (14,676 "Unknown"), so it is weak here;
- `wife_religion_raised_detail`: RELRAISD at full detail (Baptist, mainline, fundamentalist, other
  and non-denominational Protestant, Catholic, none, other).

Same women, intervals, person folds and additive spline GLM as `train_pooled.py`; paired person
bootstrap (1,000) of the held-out difference (`../extended_eval.py`).

| Women | Variant | Deviance gain % (95% CI) | Minus current, points (95% CI) |
| --- | --- | --- | --- |
| all 29,202 | current model | 5.69 (5.21–6.13) | — |
| | family of origin, 6 levels (replaces intact yes/no) | 5.66 (5.19–6.11) | −0.03 (−0.09 to +0.04) |
| | + attendance at 14 | 5.68 (5.21–6.13) | −0.01 (−0.02 to +0.01) |
| | religion raised in full detail | 5.68 (5.20–6.13) | −0.01 (−0.05 to +0.02) |
| | all three | 5.64 (5.17–6.08) | −0.05 (−0.12 to +0.02) |
| 2006–2019 cycles only | all three | 5.14 (4.50–5.82) | −0.03 (−0.12 to +0.06) |

**Nothing adds held-out skill.** The finer family of origin does sort risk (adjusted rate ratios
vs both parents, 2006–2019 women, 100 design-cluster refits, `extended_rate_ratios.csv`):
stepfamily 1.52 (1.35–1.68), parents split up or a parent died 1.32 (1.18–1.45), never-married
single parent 1.20 (1.06–1.38); but the yes/no "intact to 18" input already carries almost all of
it. Raised Baptist 1.13 (1.00–1.28) and other Protestant denomination 0.80 (0.62–0.99) vs Catholic;
attendance at 14 has wide intervals. The bundle gains `models_extended` (all three) and `extended`
test vectors; the app does not score it until the form asks.

Race: the public files give Hispanic, non-Hispanic White, Black and Other only (Asian, AIAN, NHPI
and multiracial are "Other"; `app/data/race_coverage.json`). Other pre-wedding items not yet used:
mother's education is in; the respondent's age at first sex is in (as years before the wedding);
whether she was raised in a two-parent home with a working mother (MOMWORKD), and the parents'
education beyond the mother, are candidates for a later pass.
