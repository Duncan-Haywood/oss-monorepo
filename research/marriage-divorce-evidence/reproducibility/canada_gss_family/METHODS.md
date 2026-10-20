# Canada, GSS Family cycles 1995–2017: first-marriage dissolution from the wedding day

This lens asks how many Canadian first marriages end in separation or divorce, how soon, and
which characteristics fixed on the wedding day go with a higher or lower annual rate. It pools
the retrospective marriage histories of four Statistics Canada General Social Survey (GSS)
Family cycles and is built like the NSFG 2002 lens (`../nsfg2002_first_marriage/`): one row per
marriage-year, a Poisson rate per year, models held out by person, and an app bundle
(`app/models/canada_gss_first_marriage.json`) that the browser engine reproduces exactly.
First common-law unions are described separately, as a different target.

**Headline.** 48,656 first marriages (weddings 1950–2017) and 14,235 dissolutions. 85.4% of
first marriages were intact 10 years after the wedding (95% CI 85.0–85.8%) and 76.1% after 20
years (75.6–76.6%). Held out by person, Poisson gradient boosting cut the deviance of a constant
rate by **3.57%** (95% CI 3.32–3.82%) and the additive spline GLM by 3.18% (2.95–3.42%). Their
time-dependent AUC at 10 years was 0.69, and Harrell's C was 0.65–0.66. Living together before the
wedding (rate ratio 1.81), a child born before the wedding (1.54), marrying before 20 (1.49 vs
20–24) and not living with both parents to age 15 (1.30) go with higher rates. These are
associations, not causes. The ranking is real, but no individual forecast is precise.

## Source, licence and verification

| Cycle | Year | Files (Borealis DOI, file id) | Respondents |
| --- | --- | --- | --- |
| 10 | 1995 | main `doi:10.5683/SP3/OBQRWN` (593847), union `SP3/Z2TCKX` (593909), child `SP3/UW2CPG` (593653) | 10,749 |
| 20 | 2006 | `doi:10.5683/SP3/UDCRBP` (594313) | 23,608 |
| 25 | 2011 | `doi:10.5683/SP3/1L8L3P` (594289) | 22,435 |
| 31 | 2017 | `doi:10.5683/SP3/U9YDJJ` (594230) | 20,602 |

- **Copies:** the CSV public-use microdata files (PUMF) on Borealis, the Canadian Dataverse
  Repository (no login). `sh download.sh` fetches them by file id and checks `SHA256SUMS`. The
  MD5 of every download equals the checksum Borealis publishes.
- **Checked against Statistics Canada's documentation:** `verify_counts.py` compares 53
  documented numbers with the files and all 53 match (`count_checks.csv`). It checks record
  counts, weight totals (for example 30,302,287 for 2017 and 23,267,125 for 1995) and the
  frequencies of the marital-status, ever-married and first-marriage end-type variables printed
  in the 1995 codebooks, the 2006 and 2011 user guides and the 2017 data dictionary.
- **Variable definitions:** the codebooks and the PUMF SAS setup files (value labels and the
  raw codes for "valid skip", "not stated" and "don't know"); `harmonise.py` cites each variable.
- **Licence:** [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/reference/licence).
  The repository holds only the scripts, checksums, aggregate tables and fitted model parameters.
  The person-level files (about 480 MB) stay out of git (`raw/` and `work/` are gitignored).
- **Attribution (required by the licence):** *Adapted from Statistics Canada, General Social
  Survey, Cycle 10 (1995): Family; Cycle 20 (2006): Family Transitions; Cycle 25 (2011):
  Family; Cycle 31 (2017): Family; public use microdata files. This does not constitute an
  endorsement by Statistics Canada of this product.*

## Sample and outcome

Each ever-married respondent aged 15–79 contributes their **first** marriage. Men and women both
report, and each person reports on their own marriage, so this lens is **respondent-level**.
When the current marriage is the first (`MA0_Q220`/`MA0_220` = yes; 1995 `M1CURREN`), it comes
from the current-marriage block; otherwise it comes from the first-marriage block (`MA1`, 1995 `M1`).

- **Event:** the marriage ended in separation, or in divorce or annulment without a recorded
  separation. The time is the respondent's age at the (last) separation, or at the divorce if
  that is earlier or the separation age is missing. Currently separated respondents are events.
  This matches the NSFG "disruption" outcome. Of the events, 11,371 had a recorded divorce.
- **Censoring:** at the spouse's death (widowhood, 3,875) or at the interview.
- **Time:** ages are given to one decimal, so durations are in tenths of a year. The 2006 PUMF
  gives age at interview only in whole years, so 0.5 is added. Wedding year = survey year + 0.5
  − age at interview + age at marriage.
- **2011 widowhood:** the 2011 PUMF gives no age at the first spouse's death. Dropping those
  1,283 marriages would bias dissolution upward. Instead, each is censored at an imputed time:
  the share of the wedding-to-interview span at which a donor lost their spouse, drawn from
  widowed first marriages in 2006 and 2017 of the same sex and wedding decade. Only censoring
  times are imputed; no event is created or removed.
- **Exclusions** (`sample_audit.json`, per cycle):

| | 1995 | 2006 | 2011 | 2017 |
| --- | --- | --- | --- | --- |
| first marriages in file | 7,468 | 16,476 | 16,407 | 14,365 |
| aged 80+ (age capped in the PUMF) | 339 | 967 | 1,323 | 1,129 |
| age at marriage unknown | 171 | 107 | 114 | 183 |
| end type or end age unknown | 99 | 176 | 175 | 192 |
| end recorded before the wedding | 0 | 17 | 8 | 25 |
| wedding before 1950 | 778 | 241 | 16 | 0 |
| **analysed** | **6,081** | **14,968** | **14,771** | **12,836** |
| dissolutions | 1,596 | 4,482 | 4,329 | 3,828 |

- **Intervals:** marriages are split into marriage-years (0 = first year), with follow-up
  capped at 30 years. That gives 893,155 intervals, 878,794 person-years and 13,610 events
  within 30 years.
- **Weights:** GSS person weights rescaled to mean 1 within each cycle, so a cycle counts by its
  sample size, times exposure.

## Inputs

Models use only inputs that are fixed at or before the wedding and asked the same way of intact
and dissolved marriages in every cycle:

| Input | 1995 | 2006 | 2011 | 2017 | Note |
| --- | --- | --- | --- | --- | --- |
| `age_at_marriage` | `M1AGERES` | `AGE_MA0C`/`AGE_MA1` | `AGE_MA0C`/`AGE_MA1C` | `AGEMA0C`/`AGEMA1C` | some cycles cap extremes (e.g. 15, 58) |
| `wedding_year` | derived | derived | derived | derived | 1950–2017 |
| `respondent_sex` | `DVSEX` | `SEX` | `SEX` | `SEX` | |
| `cohabited_first` | `M1CLRSSP` | `MA0_Q150` / `AGE_CL_MA1` present | `MA0_Q150`/`MA1_Q150` | `MA0_150`/`MA1_150` | asked only of people who ever lived common-law; the rest are "No" |
| `prior_union` | union file rank | rank or `AGE_CUk` | rank or `AGE_CUk C` | rank or `ACUkC` | lived common-law with someone else first (see below) |
| `premarital_birth` | child file `DVD21` | `AGE_CHDBORN_k` | `AGE_CHDBORN_kC` | `ACHBkC` | a birth child born before the wedding |
| `intact_family_15` | `A2`, `A3` | `GU_Q110/120` | `GU_Q110/120` | `GU_110/120` | lived with both parents to 15 (2017 asks "mostly") |
| `born_outside_canada` | `DVR17` | `BRTHREGC` | `BRTHREGC` | `BRTHCAN` | |
| `first_language` | `DVR25` | `LANCH` | `LANCH` | `LANMT` | 2017 is mother tongue, with more multiple answers |
| `region` | `PROV` | `REGION` | `REGION` | `REGION` | **at interview**: can postdate the marriage |
| `survey_cycle` | | | | | absorbs cycle differences; the app sets `2017` |

- **Rank of the first marriage:** the PUMF recodes this rank to "not stated" whenever any union
  date is unknown. That includes unions after the first marriage, and those are far more common
  after a dissolution. Used as it stands, a missing rank had 3.5 times the dissolution rate.
  `prior_union` therefore falls back to the start ages of common-law unions not followed by
  marriage, and has no Unknown level.
- **Unknown levels:** a few remain (cohabitation 106, intact family 70, birthplace 481,
  language 589). They are kept as their own category, so they do not bias the known levels.
  The app should not offer them.
- **Birth cohort:** it equals `wedding_year − age_at_marriage` exactly, so it adds nothing.

**Not in the models (descriptive and sensitivity only):**

- **Spouse's age (age gap):** it is missing for 7–19% of dissolved first marriages and only
  0.5–1.7% of intact ones (`missingness_by_outcome.csv`). People often do not know an
  ex-spouse's birth date, and 2006 asks it only for the current marriage. A missing age gap
  carries a rate ratio of 5.3, so the gap would leak the outcome.
- **Spouse previously married:** asked for ended first marriages only in 1995. It is a 1995-only
  sensitivity.
- **Education:** highest level at interview, which can come after the marriage. It is handled as
  in the NSFG lens: kept out of the models and shown with a timing caveat.
- **Religious affiliation and attendance:** measured at interview, and they can change with a
  divorce (reverse causation). Timing caveat; sensitivity only.
- **Parents ever separated** (1995 and 2017): included in the 1995 sensitivity. The pooled
  harmonised input is `intact_family_15`.

## Models and evaluation

Fitted with scikit-learn 1.7.2 and exported with `../bundle_export.py`:

- **Constant rate** and **duration only** (quadratic spline of `marriage_years`, 5 knots).
- **Additive spline Poisson GLM:** splines of the three numeric inputs (4 knots, degree 2) plus
  one-hot categories, with alpha = 1e-4.
- **Depth-4 Poisson tree** with at least 5,000 intervals per leaf.
- **Poisson gradient boosting** (`HistGradientBoostingRegressor`): 300 trees of depth 3,
  learning rate 0.05, at least 2,000 intervals per leaf, L2 = 1.

**Evaluation:**

- **Folds:** 5 seeded folds by person (respondent).
- **Deviance gain:** weighted Poisson deviance gain against the constant rate, on held-out
  marriage-years.
- **Discrimination:** from each person's held-out cumulative hazard, Harrell's C (10-year
  score) and the time-dependent AUC at 5, 10 and 20 years (Uno, with inverse-probability-of-
  censoring weights).
- **Calibration:** decile lift and decile calibration of the 10-year score.
- **Intervals:** 95% person-bootstrap intervals, with 1,000 draws for deviance and 100 for
  C, AUC and lift.
- **Out-of-time test:** fit on weddings before 1990 (33,168 marriages, 11,235 dissolutions),
  test on weddings from 1990 (15,488, 3,000).

### Held-out results (`heldout_model_comparison.csv`)

| Model | Deviance gain vs constant | Harrell's C | AUC 5y | AUC 10y | AUC 20y | Top/bottom decile | O/E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Duration only | 0.61% (0.52–0.71) | 0.50 | 0.49 | 0.50 | 0.50 | – | 1.00 |
| Additive spline | 3.18% (2.95–3.42) | 0.654 (0.648–0.660) | 0.678 (0.666–0.686) | 0.688 (0.680–0.696) | 0.693 (0.687–0.702) | 6.8 (6.0–7.6) | 1.00 |
| Tree, depth 4 | 2.31% (2.08–2.54) | 0.627 (0.621–0.633) | 0.655 | 0.662 | 0.664 | 5.2 (4.4–5.7) | 1.00 |
| **Gradient boosting** (shipped) | **3.57% (3.32–3.82)** | 0.656 (0.650–0.662) | 0.685 (0.674–0.694) | 0.691 (0.684–0.699) | 0.690 (0.683–0.697) | 6.9 (6.3–7.5) | 0.99 |

- **Out of time** (weddings from 1990, trained on earlier weddings):
  - Boosting gained 3.37% (2.76–3.95), with C 0.630 and AUC(10y) 0.663.
  - The additive GLM gained 2.66% (1.98–3.29), with C 0.623 and AUC(10y) 0.680, but
    over-predicted later weddings: observed/expected was 0.82. Boosting's O/E was 1.03 and the
    tree's 1.00.
  - The constant rate from earlier weddings had O/E 1.33.
  - Skill carries over to later weddings, but the GLM's level does not.
- **Sensitivity (held out the same way; not shipped):**
  - Adding the interview-time education, religion and attendance raises the gain from 3.18% to
    3.77% (C 0.668). It is mostly attendance, which can follow a divorce.
  - Adding the median-imputed spouse age gap (1995, 2011 and 2017) moves the gain from 3.09% to
    3.21%, even with the leak described above.
  - In 1995 alone, adding the spouse's marital history and parents' separation moves the gain
    from 4.11% to 4.26%.

### Rate ratios (`rate_ratios.csv`)

These come from banded piecewise-constant Poisson models (main effects; duration bands
0–1, 2–3, 4–5, 6–9, 10–14, 15–19 and 20–29 years) with design-bootstrap 95% CIs (200 replicates
per group of cycles; see below). Fixed-at-marriage model:

| Input | Level (reference) | Rate ratio (95% CI) |
| --- | --- | --- |
| Age at marriage | <20 (20–24) | 1.49 (1.40–1.58) |
| | 25–29 | 0.76 (0.71–0.80) |
| | 30–34 | 0.68 (0.62–0.75) |
| | 35+ | 0.60 (0.52–0.69) |
| Wedding period | 1950–69 (1980–89) | 0.64 (0.59–0.68) |
| | 1970–79 | 0.93 (0.87–1.00) |
| | 1990–99 | 1.04 (0.96–1.12) |
| | 2000–09 | 1.03 (0.92–1.14) |
| | 2010–17 | 0.79 (0.61–1.04) |
| Lived common-law with this spouse first | Yes (No) | 1.81 (1.70–1.92) |
| Earlier common-law union with someone else | Yes (No) | 0.94 (0.84–1.05) |
| Birth child before the wedding | Yes (No) | 1.54 (1.43–1.65) |
| Lived with both parents to 15 | No (Yes) | 1.30 (1.22–1.37) |
| Born outside Canada | Yes (No) | 0.99 (0.92–1.07) |
| First language | French (English) | 0.84 (0.78–0.92) |
| | Other | 0.61 (0.56–0.67) |
| Region at interview | Quebec (Ontario) | 1.10 (1.01–1.20) |
| | British Columbia | 1.13 (1.06–1.21) |
| | Atlantic | 0.75 (0.70–0.80) |
| | Prairies | 0.88 (0.83–0.94) |
| Respondent sex | Male (Female) | 1.02 (0.98–1.07) |

**Labelled sensitivity models (timing or missingness caveats):**

- **Interview-time inputs:** weekly religious attendance at interview 0.48 (0.45–0.52) vs none;
  no religious affiliation 1.15 (1.08–1.23); bachelor's degree or more at interview 0.93
  (0.87–1.00) vs high school. With these inputs added, the cohabitation ratio falls from 1.81
  to 1.55.
- **Spouse age gap** (known values only, 1995/2011/2017): a spouse 6+ years younger goes with
  1.29 (1.11–1.49), and a spouse 2–5 years older with 0.91 (0.85–0.99), vs within a year.
- **1995 only:** spouse previously married 1.38 (1.06–1.78); respondent's parents ever
  separated 1.50 (1.23–1.85).

### Survey design and uncertainty

- **Bootstrap weights:** 2006 and 2011 ship 500 **mean** bootstrap weights, each built from
  R = 25 bootstrap samples (variance = 25/500 × Σ(θ_b − θ)², per the user guides). 2017 ships 500
  **standard** bootstrap weights (variance = 1/500 × Σ…). 1995 ships none, so a Poisson(1)
  person resample of its final weight stands in, which ignores its design.
- **Pooling the variance:** pooled estimates are re-computed with one group of cycles perturbed
  at a time (1995 + 2017; 2006 + 2011), and the two variance components are added, the second
  scaled by 25 (`harmonise.bootstrap_variance`).
- **Coverage:** Kaplan–Meier CIs use all 500 replicates; rate-ratio CIs use 200.
- **Held-out skill intervals** are person-bootstrap intervals, not design-based.

## Descriptive survival (`weighted_survival.csv`)

The table is a survey-weighted Kaplan–Meier of first marriages not yet dissolved. Selected
rows (95% design CI):

| Group | Marriages | 5 years | 10 years | 20 years |
| --- | --- | --- | --- | --- |
| All first marriages | 48,656 | 92.2% | 85.4% (85.0–85.8) | 76.1% (75.6–76.6) |
| Wedding 1950–69 | 13,048 | 96.2% | 91.4% | 83.1% |
| Wedding 1970–79 | 11,036 | 91.5% | 84.1% | 74.3% |
| Wedding 1980–89 | 9,084 | 90.6% | 82.6% | 72.3% |
| Wedding 1990–99 | 7,662 | 90.4% | 83.0% | 73.9% |
| Wedding 2000–09 | 6,051 | 91.0% | 84.9% | 79.0% |
| Married under 20 | 6,937 | 89.6% | 80.6% | 68.9% |
| Married 25–29 | 12,917 | 93.2% | 87.3% | 78.9% |
| Lived together first | 12,059 | 86.5% | 75.3% | 62.5% |
| Did not live together first | 36,491 | 94.0% | 88.4% | 79.8% |
| Child born before the wedding | 5,228 | 85.2% | 74.1% | 61.9% |

Further rows break the survival down by language, region, Quebec against the rest of Canada by
wedding decade, interview-time education and religion, spouse age gap and the 1995 partner
history. Each has a 95% design CI, and a "not divorced" column counts legal divorce only.

## Canada against the United States (`canada_vs_us_survival.csv`)

The U.S. figures come from the NSFG 2002 lens bundle (`weighted_survival`). They are women aged
15–44 in 2002–03, first marriages from the wedding, with separation counted. The Canadian rows
are women's own first marriages from the GSS, also with separation counted:

| Group | Canada 10y | U.S. 10y | Canada 20y | U.S. 20y |
| --- | --- | --- | --- | --- |
| Weddings 1970–2002 (Canada) vs all NSFG first marriages | 82.6% (81.9–83.3) | 63.8% | 72.0% (71.2–72.9) | 49.3% |
| Same, Canadian women aged 15–44 at interview (1995/2006 cycles) | 79.5% (78.0–80.9) | 63.8% | 66.6% (64.1–69.0) | 49.3% |
| Weddings 1970–84 | 83.1% | 60.1% | 72.4% | 44.6% |
| Married under 20 | 76.4% | 54.0% | 63.6% | 36.4% |
| Married 20–24 | 82.4% | 65.0% | 71.9% | 53.5% |
| Lived together first | 74.3% | 60.7% | 61.6% | 42.7% |
| Did not live together first | 86.0% | 66.2% | 76.2% | 53.0% |

In every comparable cell, Canadian first marriages survived longer: by 10–23 points at 10 years
and 17–28 points at 20 years. Even women aged 15–44 at interview, the group closest to the
NSFG's, still show a 16-point gap at 10 years.

**Caveats:**

- The surveys differ in mode (GSS by telephone, NSFG in person), question wording, the
  interview years (1995–2017 against 2002) and the age range.
- Retrospective reports of short, early-ended marriages may be under-recorded in a telephone
  survey.
- The cohabitation contrast is relative to each country's own baseline.

## First common-law unions (descriptive; `cohabitation_survival.csv`)

This is a **different target**. It follows each respondent's first co-residential union that
began as common-law, from the start of living together to the couple's separation:

- Marrying that partner is not an end. The partner's death and the interview censor.
- Unions are rebuilt from the common-law-before-marriage ages in each marriage block and from
  the blocks for common-law unions not followed by marriage. The earliest start counts.
- **Sample:** 25,473 unions (2,866 / 6,997 / 7,824 / 7,786 by cycle) and 13,025 separations.

**Results (95% design CI):**

- Still together after 5 years: 70.2% (69.5–70.9). After 10 years: 57.7% (56.9–58.5). After 20
  years: 45.8%.
- Unions begun before age 20: 42.0% after 10 years. Begun at 35+: 73.2%.
- Quebec (where common-law unions are most common): 55.4% after 10 years against 58.8%
  elsewhere.
- 43.7% (weighted) later married the partner.
- Splitting by whether the couple later married conditions on the future. Those rows are
  descriptive only.

**Caveats:** the PUMF keeps at most three or four past unions per type, and 2011 gives no age
at a partner's death. Unions with an unknown end (95 in 1995 to 491 in 2011) are dropped.

## Bundle for the app

`canada_gss_first_marriage.json` follows the NSFG bundle schema:

- **Models:** `duration_only`, `additive_spline`, `tree_depth4` and `gradient_boosting`, each
  with held-out, out-of-time and decile-calibration results. `gradient_boosting` is the shipped
  model.
- **Scoring:** `constant_rate`, `support`, `inputs`, `app_defaults` (`survey_cycle` = 2017),
  `not_used_in_models` and `abstain`.
- **`weighted_survival`** and **`canada_vs_us`** tables.
- **`ood`:** the squared Mahalanobis distance on the fixed inputs (age at marriage, wedding
  year and the eight categories; survey cycle excluded), as a percentile among held-out people.
  It uses `app/tools/ood.py`.
- **`population_reference`:** survey-weighted quantiles (p1, p5, p10, …, p90, p95, p99) of
  **held-out** predicted 5-, 10- and 20-year dissolution probabilities from the shipped model.
  There is one cell overall and one per level of sex, age band, wedding period, cohabitation,
  prior union, premarital birth, intact family, birthplace, language, region and cycle. Every
  cell has at least 100 unweighted marriages, `n` records the count, and Unknown levels are
  omitted. Overall, the median predicted 10-year dissolution is 12.4% (5th–95th percentile
  4.6–30.8%), and 20-year is 21.6% (9.7–45.6%).

**Using it in the app:**

- The support is ages 15.8–48 at marriage, weddings 1951–2016 and marriage years 0–29. Weddings
  after 2016 should be held at 2016, and the app should say so.
- The lens is respondent-level: score a couple through one partner at a time and say which.
- Previously married people get no number.
- Parity: `app/tests/canada_gss.test.mjs` checks all four models against Python to 1e-9
  relative on 60 test vectors (`canada_gss_first_marriage_testvectors.json`). It also checks
  that the explanations reproduce each prediction exactly and that the OOD distances match.

## Limitations

- **Survivor and recall selection:** retrospective histories come from people alive and in a
  household at interview (aged 15–79). Early weddings are seen only through survivors, and
  recall of old, short marriages may be incomplete.
- **Two-sided reports:** each marriage is described by one spouse. Men and women report
  different marriages, and the partner's characteristics are mostly not usable (see above).
- **Interview-time measures:** region, education and religion are measured at interview, so
  their associations are not prospective.
- **Not causal:** the rate ratios are adjusted associations, not causal effects. Cohabitation
  and a premarital birth mark selection into those paths as much as any effect of them.
- **Modest skill:** the shipped model ranks a dissolving marriage above an intact one about 66%
  of the time. A personal forecast stays wide: the held-out 10-year risk ranges from 4.6% to
  30.8% between the 5th and 95th percentiles of real couples.

## Reproduce

```sh
sh download.sh                 # ~480 MB from Borealis, checks SHA256SUMS
python3 verify_counts.py       # 53 checks against Statistics Canada documentation
python3 tables.py              # survival, Canada vs U.S., common-law, rate ratios (~30-60 min)
python3 train_models.py        # models, held-out evaluation, bundle and test vectors (~30-60 min)
node --test ../../app/tests/canada_gss.test.mjs
```

Needs numpy, pandas and scikit-learn 1.7.2 (`requirements.txt`). Run `tables.py` before
`train_models.py`: the bundle embeds `weighted_survival.csv` and `canada_vs_us_survival.csv`.
Set `OMP_NUM_THREADS=1` on a shared machine. `--jobs=N` sets the number of parallel CV folds.

## 2026-10-20 extension: family of origin in detail, and religion (`extended_predictors.py`)

`CANADA_WORK=<dir with first_marriages.pkl> CANADA_RAW=raw python3 extended_predictors.py`.

**Family of origin** (before the wedding). The 2017 cycle is the richest family-of-origin source in
the project: besides "always lived with both parents to 15" (GU_120) it gives the respondent's age
when the parents separated or divorced (APARSEPC/APARDIVC), when each parent died
(AMDIEDC/AFDIEDC), and whether the parents were ever married to each other (GU_190/GU_210). Levels:
both parents to 15 / parents divorced or separated before 15 / a parent died before 15 /
never-married parents / not intact, reason not known (2006 and 2011 ask only GU_Q120/190/210) /
unknown (incl. 1995). Adjusted rate ratios vs both parents (every current input and a
marriage-length spline, 60 person-bootstrap refits; `extended_rate_ratios.csv`), 2017 cycle
(12,836 marriages): **never-married parents 1.59 (1.31–2.13), parents divorced or separated 1.30
(1.11–1.57), a parent died 1.01 (0.80–1.29)**; 2006–2017 pooled: never-married parents 1.81
(1.48–2.02), not intact for another or unknown reason 1.25 (1.14–1.33). So the reason matters — a
parent's death is not associated with the respondent's own separation, a parental split and
never-married parents are — but held out it adds nothing over the yes/no input: −0.00 points
(−0.02 to +0.02) on all cycles, +0.02 (−0.04 to +0.06) on 2017 alone.

**Religion** — attendance (5 levels), importance, private religious practice (REE_03, 2017: prayer,
meditation and the like) and affiliation — is asked **at the interview**, years after many
dissolutions. It improves held-out deviance by +0.51 points (0.41–0.60), but that is not a valid
prospective gain: attendance at least weekly goes with 0.41 (0.34–0.51) times the rate, private
practice daily with 1.48 (1.30–1.67), and people who separate change their religious life
afterwards. It is reported only; the bundle's `models_extended` holds the family-of-origin model
alone.

| Cycles | Variant | Deviance gain % (95% CI) | Minus current, points (95% CI) |
| --- | --- | --- | --- |
| all (48,656 marriages) | current model | 3.18 (2.95–3.42) | — |
| | family of origin, detailed | 3.18 (2.95–3.42) | −0.00 (−0.02 to +0.02) |
| | + religion at interview (not prospective) | 3.69 (3.44–3.96) | +0.51 (+0.41 to +0.60) |
| 2017 only | family of origin, detailed | 2.73 (2.28–3.17) | +0.02 (−0.04 to +0.06) |

Race is not on the PUMF beyond a visible-minority flag, so this lens has no race input
(`app/data/race_coverage.json`).
