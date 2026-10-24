# NSFG 2002 first marriages: per-year dissolution from the wedding day

This dataset gives the app a lens on **young and newly married couples**. The NLSY79 lens
starts at ages 35–64. Here every first marriage is followed from its wedding month, for
weddings from 1972 to 2002. The bundle's `support` (the central 99% of marriages) is a wife
aged 15–40 and a husband aged 17–50 at the wedding, and marriage years 0–23, the last year
with at least 50 marriages at risk. The app should flag anything outside it.

## Source and verification

- **Data:** National Survey of Family Growth, 2002 (Cycle 6), female respondent public-use
  file (`2002FemResp.dat`) and its Stata dictionary (`2002FemResp.dct`), from the National
  Center for Health Statistics. The official copies are at
  `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/` (`2002FemResp.dat`,
  `stata/2002FemResp.dct`), with documentation at
  `https://www.cdc.gov/nchs/nsfg/nsfg_cycle6.htm`.
- **Copy used:** CDC hosts were blocked from the cloud session (2026-10-19), so `download.sh`
  fetches the byte copies Allen Downey keeps for *Think Stats* at
  `github.com/AllenDowney/ThinkStats2/tree/master/code` (gzipped data plus the dictionary).
  `SHA256SUMS` records both files. NCHS publishes no checksum for them, so the copy was
  checked against published facts instead:
  - 7,643 records, which is the official Cycle 6 female sample size;
  - final weights summing to 61.56 million, which matches NCHS's published estimate of
    61.6 million U.S. women aged 15–44 in 2002;
  - `MAR1DISS` (months from first marriage to its end or the interview) equals
    `CMINTVW − MARDAT01` for every intact first marriage (0 mismatches among 2,576).
  The dictionary is the official NCHS layout, so a corrupted copy would fail these checks.
- **Terms:** NSFG public-use files are released by NCHS for statistical research. Users
  must not try to identify any respondent or link records to identify anyone. Because the
  terms do not clearly allow redistribution, the repository commits only the download
  script, checksums, code, aggregate tables and fitted model parameters. Raw records and
  the person-level extract stay out of git (`.gitignore`).
- **Citation:** National Center for Health Statistics. *National Survey of Family Growth,
  Cycle 6 (2002), Female Respondent File.* Hyattsville, MD: NCHS, 2004.

## Sample and outcome

- Population: ever-married women 15–44 in the U.S. household population (4,126 of the
  7,643 respondents), each contributing her **first** marriage. The husband may have been
  married before. Everything is the wife's report.
- Event: the first marriage ended in **divorce, annulment or separation**
  (`MAREND01` = 1 or 2; 1,492 events, 1,232 of them divorce or annulment). Widowhood (58) is
  censored at the husband's death. This is NCHS's usual "disruption" outcome. Separations
  are counted because many separated couples have not yet divorced.
- Time: `MAR1DISS` months, placed at mid-month (+0.5) because dates are whole months. Each
  marriage is split into marriage-years (0 = first year): 32,460 intervals and 30,341
  person-years. Seven records give an age at marriage under 14. They are kept in the fit,
  as recorded, and fall outside the support. A model's prediction is a Poisson rate per year. The app turns it into
  P(dissolution in year k) = 1 − exp(−rate<sub>k</sub>).

## Inputs (all fixed at or before the wedding, except as noted)

| Input | Variable | Note |
| --- | --- | --- |
| `marriage_years` | interval start | years since the wedding |
| `wife_age_at_marriage` | (`MARDAT01` − `CMBIRTH`)/12 | |
| `husband_age_at_marriage` | `HXAGEMAR` | 42 missing, imputed with the median |
| `wedding_year` | from `MARDAT01` | 1972–2002; the app should hold it at 2002 for weddings now |
| `cohabited_first` | `LVTOGHX` | lived together before marrying |
| `husband_married_before` | `MARBEFHX` | |
| `husband_prior_children` | `KIDSHX` | children from a prior relationship |
| `wife_race_ethnicity` | `HISPRACE` | |
| `same_race_ethnicity` | `HISPHX`, `RACEHX1` versus `HISPRACE` | husband's broad group versus the wife's |
| `wife_intact_family` | `INTACT18` | lived with both parents from birth to 18 |

About 20 answers per question were refused or "don't know". They are kept as an `Unknown`
category, which the app should not offer as a choice.

**Excluded on purpose:**

- `CHEDMARN` (husband's education) is recorded only for women still married to that
  husband, so it is missing for all 1,232 first marriages that ended in divorce. Using it would leak
  the outcome.
- The wife's own education, income and religion are measured at interview, which can come
  after the dissolution.
- `RELRAISD` (religion raised in) was left out because its 2002 value labels could not be
  checked against the codebook from this session.

## Models and evaluation

- **Validation:** 5-fold cross-validation. Respondents are assigned to folds by a seeded
  shuffle, so each woman's intervals are all in one fold. Fits use NSFG final weights
  (normalised to mean 1) times exposure. The score is held-out weighted Poisson deviance
  per person-year.
- **Constant:** the training-fold rate.
- **Duration only:** a quadratic spline in `marriage_years` (5 quantile knots). This is the
  baseline curve that knows nothing about the couple.
- **Additive spline Poisson:** quadratic splines (4 quantile knots, linear extrapolation)
  for the four numeric inputs, plus one-hot categories. `PoissonRegressor`, alpha 1e-4.
- **Poisson tree, depth 3:** at least 1,500 intervals per leaf.

| Model | Held-out deviance gain vs constant | vs duration only | Fold range | Observed/expected |
| --- | --- | --- | --- | --- |
| Duration only | 0.38% | — | 0.26–0.50% | 1.000 |
| Additive spline Poisson | **3.02%** | 2.65% | 2.30–4.13% | 0.988 |
| Poisson tree, depth 3 | 0.91% | 0.53% | −0.33–1.71% | 0.988 |

Held-out calibration of the additive model, in ten exposure-weighted bins
(`heldout_calibration.csv`): observed annual rates run from 1.3% in the lowest bin to 9.5%
in the highest, with predictions of 1.6% and 10.3%. The gain is small in deviance terms, as
in the NLSY79 lens. Most of what ends a marriage is not in these variables.

`additive_partial_effects.csv` gives the final model's rate ratios when one input changes
and everything else stays fixed. For example, a wife who married at 17 has a rate ratio of
1.63 compared with one who married at 22.3, and one who married at 28 has 0.70. Premarital
cohabitation gives 1.24. A husband who was married before gives 1.29, and one with prior
children gives 1.47. The same race-ethnicity gives 0.72, and an intact family of origin
gives 0.70. These are **associations in marriages begun 1972–2002, not causes**: who
cohabits, or marries young, differs in ways the survey does not measure.

`weighted_survival.csv` holds survey-weighted Kaplan–Meier survival of first marriages:
95.0% still intact after 1 year, 78.0% after 5, 63.8% after 10 and 49.3% after 20. That is
the same range as NCHS's published figures from the 1995 cycle (about 20% disrupted by
5 years and 33% by 10; Bramlett & Mosher 2002). Groups by age at marriage, cohabitation,
husband's prior marriage and wedding period are in the same file.

## Limits

- One cross-section from 2002–03. Marriages that began recently have short follow-up, and
  long durations come only from women who married young. The model treats duration and
  wedding cohort as additive.
- Only women's first marriages, and only the wife's view. There is no relationship quality,
  income or children, and no information on the husband except what she reported.
- `wedding_year` beyond 2002 is extrapolation. The app should hold it at 2002, label it,
  and abstain for same-sex couples or a previously married wife.
- Survey design (strata `SEST`, clusters `SECU_R`) is not used for model uncertainty. The
  held-out fold range is the spread reported.

## Reproduce

```sh
sh download.sh                       # fetches and checks the two raw files into raw/
pip install -r requirements.txt      # numpy, pandas, scikit-learn 1.7.2
python3 train_models.py              # ~5 s; writes the CSVs, sample_audit.json, tree_depth3.txt,
                                     # ../../app/models/nsfg2002_first_marriage{,_testvectors}.json
node --test ../../app/tests/nsfg2002.test.mjs
```
