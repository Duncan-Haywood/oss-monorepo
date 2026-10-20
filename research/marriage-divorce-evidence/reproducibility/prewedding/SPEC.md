# Before the wedding: harmonized pre-wedding feature set (spec)

Goal: answer "how well can divorce be predicted before the wedding?" by training only on
facts knowable on the wedding day, harmonized across datasets so a model trained on one
dataset can be tested on another.

## Per-dataset builder

`build_<dataset>.py` in this folder reads that dataset's own raw files (fetched by its
`../<dataset dir>/download.sh`; reuse its builder functions where possible) and writes
`work/<dataset>.csv.gz` (gitignored; person-level rows are never committed), one row per
first marriage of a respondent, with exactly these columns:

| column | values |
| --- | --- |
| `dataset` | `nsfg_pooled`, `nlsy97`, `nlsy79`, `sipp`, `canada_gss` |
| `id` | respondent id, prefixed with the dataset (`nsfg:2002:12345`) |
| `weight` | survey weight, normalized to mean 1 within the dataset |
| `duration_years` | wedding to first dissolution or censoring, in years (> 0) |
| `event` | 1 if the marriage ended by divorce, annulment or separation (whichever comes first), 0 if censored (interview, death of spouse, attrition) |
| `event_definition` | short text, the same on every row of a dataset |
| `wedding_year` | calendar year (number) |
| `respondent_sex` | `Woman`, `Man` |
| `wife_age`, `husband_age` | age in years at the wedding (number; blank if unknown) |
| `wife_educ`, `husband_educ` | education completed BY THE WEDDING: `Less than high school`, `High school`, `Some college`, `Bachelor+`, `Unknown`. If a dataset only measures education at interview, use `Unknown` (never interview education) |
| `wife_prior_marriage`, `husband_prior_marriage` | `Yes`, `No`, `Unknown` (the respondent is `No` by construction in a first-marriage lens) |
| `wife_prior_children`, `husband_prior_children` | children born before the wedding (with anyone): `Yes`, `No`, `Unknown` |
| `cohabited_first` | lived together before the wedding: `Yes`, `No`, `Unknown` |
| `wife_race`, `husband_race` | `Hispanic`, `White`, `Black`, `Other`, `Unknown` (non-Hispanic unless Hispanic; Canada: `Unknown` unless a defensible mapping exists) |
| `intact_family` | respondent lived with both biological/adoptive parents through about age 15–18: `Yes`, `No`, `Unknown` |
| `religion_raised` | religion the respondent was raised in: `None`, `Catholic`, `Protestant`, `Other`, `Unknown` |
| `country` | `US`, `Canada` |

Rules:

- **Timing is everything.** A value counts only if it was true on the wedding day and is
  known from information dated on or before it (or is fixed at birth). A partner trait taken
  from an interview after the wedding is NOT pre-wedding unless it cannot have changed
  (e.g. race, the partner's age at the wedding computed from a birth date). Partner education
  from a later interview is `Unknown`. When in doubt, use `Unknown` and record it in the audit.
- Do not drop marriages for missing predictors; use `Unknown` / blank.
- Real data only. Same sample restrictions as the dataset's existing lens (say what they are).

## Leakage audit

`leakage_<dataset>.csv` with columns `dataset, predictor, existing_lens_uses (yes/no),
measured_when (before wedding / fixed at birth / at wedding / after wedding / at interview),
source, leaks (yes/no/possible), note`. Cover every predictor the existing lens's models use
and every harmonized column.

`leakage_refit_<dataset>.csv`: using the existing lens's own model (its additive spline
Poisson or equivalent) and its own person-held-out folds, the held-out deviance gain vs a
constant rate (a) as published and (b) refit without every predictor flagged `yes` or
`possible`. Columns `dataset, model, predictors_removed, gain_with_percent, gain_without_percent, change_points`.
