# How well can divorce be predicted before the wedding?

Five national surveys, about 280,000 first marriages, and only facts that are knowable on the
wedding day. The answer: **modestly, and about equally well in every dataset.** Held out by
person, the best model ranks a couple who will divorce above one who will not about 64–66%
of the time (Harrell's C 0.634–0.664; AUC at 10 years 0.66–0.68), with 10-year calibration
within 3%. Gradient boosting gains at most 0.7 points of deviance over an additive model
and, in NLSY97, none. Trained on one U.S. survey and tested on another, the models keep most
of their ranking (C 0.61–0.66) but the predicted level can be off by up to about a third,
because the surveys define and observe dissolution differently. Applied to Canada, U.S.-trained
models still rank couples (C 0.59–0.61, against 0.646 for Canada's own model) but predict 1.5
to 2.2 times the divorce Canada has.

This folder holds the leakage audit, the harmonized pre-wedding feature set and the
within- and cross-dataset evaluation. Person-level rows are rebuilt from each dataset's
public files and never committed.

## 1. Leakage audit: what each existing lens knew after the wedding

Each `leakage_<dataset>.csv` lists every predictor the existing lens uses and when it is
measured. Each `leakage_refit_<dataset>.csv` refits the lens's own model on its own person
folds without the predictors flagged as post-wedding (`yes`) or possibly so (`possible`).
Held-out deviance gain over a constant rate, percent:

| Lens | Post-wedding inputs found | Published | Pre-wedding only | Change |
| --- | --- | --- | --- | --- |
| NLSY79 first marriage, additive | spouse education, work and co-residence from the first interview after the wedding; whether spouse age is observed | 5.07 | 4.52 | −0.56 |
| NLSY79 first marriage, boosting | (same) | 5.60 | 4.54 | −1.07 |
| NLSY97 first marriage, additive | spouse education (median 7 months after); spouse prior marriage and children; pregnancy at the wedding (defined by a later birth) | 4.82 | 4.50 | −0.33 |
| NLSY97 first marriage, boosting | (same) | 4.91 | 4.64 | −0.27 |
| NSFG 1995–2023, both sexes | a bachelor's earned in the wedding year counted as before it (year-only cycles) | 4.74 | 4.52 | −0.22 |
| SIPP retrospective, education model | education "at the wedding" dated by recalled years; its universe from interview attainment | 4.41 | 4.14 | −0.27 |
| SIPP retrospective, main model | none | 4.07 | 4.07 | 0 |
| Canada GSS | region measured at interview; survey-cycle term | 3.18 | 3.07 | −0.11 |

Two findings matter beyond the numbers:

- **Missing values can leak the outcome.** In NLSY79, a spouse missing from the household
  roster at the first post-wedding interview marks a marriage that already ended (29.7% of
  blank rows ended within two years, against 6.1% of known rows). In Canada's 2017 cycle the
  spouse's age is missing for 6.8% of dissolved and 1.5% of intact marriages. NLSY97 spouse
  race is unknown for couples who split before the next interview (65% dissolved). So the
  harmonized models never use a missing indicator or an "Unknown" category: missing numbers
  get the training median and missing categories the most common known level.
- **"Unknown education" collects people who studied after the wedding.** When a degree cannot
  be dated before the wedding, the person is disproportionately someone who earned it later
  (NSFG audit: replacing the lens's flag with a strictly dated one *raised* the gain). The
  harmonized models use education only where at least 90% of rows have a dated value.

With only pre-wedding inputs, boosting no longer beats the additive model in NLSY79, and its
edge in NLSY97 shrinks to within noise.

## 2. The harmonized pre-wedding feature set

`SPEC.md` defines it; `build_<dataset>.py` builds it from each lens's own code and raw files
(`feature_coverage.csv` gives the share of rows with a known value). The models use the
respondent's and the spouse's traits rather than the wife's and the husband's, because each
survey interviews one spouse:

| Feature | Canada GSS | NLSY79 | NLSY97 | NSFG 1995–2023 | SIPP |
| --- | --- | --- | --- | --- | --- |
| Respondent age at marriage, wedding year, sex | ✓ | ✓ | ✓ | ✓ | ✓ |
| Spouse age at marriage (and the age gap) | 26% | 91% | 93% | 66% | — |
| Respondent education by the wedding | — | ✓ | ✓ | 56% (not used) | 72% (not used) |
| Spouse education by the wedding | — | 16% | 41% | — | — |
| Spouse married before | 12% | — | 9% | 67% | — |
| Children born before the wedding (respondent) | ✓ | ✓ | ✓ | ✓ | 67% |
| Lived together first | ✓ | ✓ | ✓ | ✓ | — |
| Race/ethnicity (respondent; spouse; same) | — | ✓; —; — | ✓; 95%; 95% | ✓; 61%; 61% | ✓; —; — |
| Lived with both parents through adolescence | ✓ | ✓ | ✓ | ✓ | — |
| Religion raised | — | ✓ | ✓ | 90% | — |

A feature enters a model only where at least half the rows know it (90% for education).

## 3. Within each dataset (5-fold, held out by person)

`within_dataset.csv`. Deviance gain over the training constant rate; C on the predicted
10-year cumulative hazard; AUC at 5 and 10 years with inverse-probability-of-censoring
weights; calibration as weighted Kaplan–Meier over mean predicted probability at 10 years.

| Dataset | Marriages | Dissolutions | Model | Gain % | C | AUC 5y | AUC 10y | Obs/exp 10y |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Canada GSS 1995–2017 | 48,656 | 13,615 | additive | 3.01 | 0.644 | 0.673 | 0.677 | 1.00 |
| | | | boosting | 3.31 | 0.646 | 0.676 | 0.680 | 1.01 |
| NLSY79 | 6,768 | 3,075 | additive | 4.36 | 0.638 | 0.656 | 0.671 | 0.99 |
| | | | boosting | 4.38 | 0.642 | 0.664 | 0.677 | 0.99 |
| NLSY97 | 5,076 | 1,906 | additive | 4.12 | 0.658 | 0.677 | 0.659 | 1.03 |
| | | | boosting | 4.06 | 0.658 | 0.679 | 0.663 | 1.01 |
| NSFG 1995–2023 | 43,336 | 15,256 | additive | 4.00 | 0.661 | 0.673 | 0.656 | 1.03 |
| | | | boosting | 4.25 | 0.664 | 0.678 | 0.664 | 1.02 |
| SIPP 2001–2025 | 176,303 | 60,868 | additive | 4.01 | 0.634 | 0.648 | 0.660 | 1.01 |
| | | | boosting | 4.73 | 0.634 | 0.648 | 0.662 | 1.02 |

The discrete-time logistic hazard matches the additive Poisson model to within 0.03 points
everywhere. Marriage length alone gains 0.5–2.0% (it shapes the yearly hazard but cannot rank
couples: C = 0.5 by construction).

## 4. Across datasets (train on one, test on another)

`external_validation.csv` covers all 20 pairs, four model families and two feature sets
(every shared feature; the same without wedding year). The recalibrated gain rescales the
model's rates to the test data's overall level, so it measures ranking and shape only.
Additive model, all shared features:

| Train → test | C | AUC 10y | Obs/exp 10y | Recalibrated gain % |
| --- | --- | --- | --- | --- |
| NSFG → NLSY97 | 0.647 | 0.643 | 0.99 | 2.74 |
| NSFG → NLSY79 | 0.621 | 0.659 | 1.07 | 3.20 |
| NSFG → SIPP | 0.626 | 0.656 | 0.85 | 2.45 |
| NLSY79 → NLSY97 | 0.659 | 0.653 | 0.88 | 3.86 |
| NLSY79 → NSFG | 0.646 | 0.640 | 0.81 | 3.20 |
| SIPP → NSFG | 0.638 | 0.615 | 1.23 | 1.35 |
| SIPP → NLSY79 | 0.608 | 0.638 | 1.23 | 2.74 |
| NSFG → Canada | 0.611 | 0.622 | 0.58 | 1.81 |
| SIPP → Canada | 0.604 | 0.613 | 0.66 | 1.36 |
| NLSY79 → Canada | 0.594 | 0.596 | 0.46 | 1.30 |
| Canada → NSFG | 0.629 | 0.640 | 1.51 | 2.44 |
| Canada → SIPP | 0.619 | 0.650 | 1.53 | 2.86 |

- **Ranking transports, level does not.** Between U.S. surveys a model loses 0.00–0.05 of C
  against the test survey's own model. The predicted 10-year level is off by −32% to +30%,
  because the surveys differ in what counts as the end (legal divorce, separation, the first
  month marked separated), whom they follow and how they recall. Canada's 10-year
  dissolution (15%) is about half the U.S. surveys' (26–32%), so U.S.-trained levels run
  1.5–2.2 times too high there.
- **Wedding year does not extrapolate.** NLSY97 weddings run 1997–2024. Its additive model
  applied to SIPP or Canada, with weddings back to 1950–1960, loses 31–38% of deviance
  against the training constant. Without wedding year the same model transports (C 0.617 on
  SIPP, gain +3.3%). Boosting, whose trees cannot extrapolate a trend, suffers far less (−2.0% on SIPP, +3.6% on
  Canada).
- **NSFG is the best single source.** It is large, spans weddings from the 1970s to 2023, and
  carries spouse traits. Its additive model is the best calibrated across the other U.S.
  surveys, so it is the candidate for the app's "before the wedding" lens.

## The app lens

`../../app/tools/export_prewedding.py` exports the NSFG additive model as
`app/models/prewedding_harmonized.json` (26 KB), with its within-NSFG and external skill,
cross-fitted population quantiles (10-year dissolution median 28%, 10th–90th percentile
16–51%) and an out-of-distribution score; see `../../app/README.md`.

## What pre-wedding traits cannot capture

These are demographic and family-history facts. They say nothing about how the couple get on:
conflict, commitment, communication, money habits, or what happens after the wedding (job
loss, illness, children, moving). The skill ceiling above (C ≈ 0.65) is the skill of
demographics. A newlywed study in this project, which coded observed conflict, added nothing
held out (see `../newlywed_la_karney/`). The data also cannot speak to same-sex couples,
second marriages, people outside the U.S. and Canada, or weddings after 2023–2025. Each model
reports associations in its survey's population, not causes: marrying later is linked to a
lower rate, but waiting does not by itself change anyone's odds.

## Reproduce

1. Fetch each dataset with its lens's `download.sh` (`../nsfg_pooled_first_marriage/`,
   `../nlsy97_first_marriage/`, `../nlsy79_full/`, `../sipp_marital_history/`,
   `../canada_gss_family/`). Checksums are in each `SHA256SUMS`.
2. Build: `python3 build_<dataset>.py` (see each script's docstring for arguments; add
   `--refit` for the leakage refit).
3. Evaluate: `python3 crossval.py` (scikit-learn 1.7.2; about 20 minutes here).
