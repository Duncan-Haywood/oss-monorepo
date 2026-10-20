# NLSY97 first marriages: separation or divorce from the wedding month, predicted for two people

This lens covers the **young cohort**. NLSY97 respondents were born in 1980–84 and interviewed
from 1997 to 2023/24. Their first marriages began in 1995–2024 and are followed **prospectively**
from the wedding month. Every predictor is fixed at or before the wedding. The spouse comes from
the household roster or the partner section. The question is how much better than a constant
rate, held out by person, a model can rank and calibrate a couple's risk of separating or
divorcing.

**Headline (held out by person).** The best model is Poisson gradient boosting. It reduces Poisson
deviance by **4.9% (95% CI 4.2–5.5)** relative to a constant rate. Harrell's C is **0.677
(0.665–0.690)**. Uno's time-dependent AUC is **0.697 (0.677–0.717) at 5 years** and **0.686
(0.670–0.705) at 10 years**. Marriages in the top predicted decile separated or divorced at
9.5% a year in their first ten years, against 0.94% a year in the bottom decile, a **10-fold
lift (7.1–16.2)**. Predicted 10-year dissolution runs from 9% in the lowest decile to 62% in the
highest. Weighted Kaplan–Meier gives 9% and 61% in those deciles. The additive spline GLM is
close behind: 4.7% (3.9–5.5), C 0.672, AUC10 0.677. It has exact per-input explanations.
Marriage length alone gains only 0.55%. These numbers measure ranking and calibration among real
couples. They are not "accuracy", and they are not causal effects.

## Source and verification

- **Data:** NLSY97 all-variables public release, rounds 1–21,
  `https://nlsinfo.org/cohort-data/nlsy97_all_1997-2023.zip`, published by the BLS National
  Longitudinal Surveys (CHRR, Ohio State). The file is 475,462,343 bytes, with server
  Last-Modified 2026-01-23. Its SHA-256 is in `SHA256SUMS` (`8c513e48…3c28`, recorded
  2026-10-20). No login is needed, and the data are public-use with no geocode.
- **Never unzipped.** The zip holds an 8.1 GB CSV with 305,325 columns and the `.cdb` codebook.
  `select_vars.py` streams the codebook and picks 3,729 respondent, marital, schooling and
  partner columns plus 4,183 household-roster columns. `extract.py` streams just those columns
  into the work directory: about 210 MB, person-level, outside git.
- **Checks against the release's own documentation:**
  - 8,984 round-1 respondents, the BLS sample size.
  - Round-1 cumulative-cases weights summing to 19.38 million.
  - `CVC_MARRIAGES_TTL` > 0 for 5,252 respondents, of whom 5,148 have a first-marriage month
    (`CVC_FIRST_MARRY_MONTH`).
  - The codebook's frequency table for `CVC_FIRST_MARRY_END` (1,820 divorced, 20 widowed, 45
    unknown) matches the extract.
- **Terms:** BLS public-use data. Users may not attempt to identify respondents. Only scripts,
  the checksum, aggregate tables and fitted parameters are committed.

Reproduce: `sh download.sh`, then `NLSY97_WORK=<work dir> python3 train_models.py` with
scikit-learn 1.7.2 (`requirements.txt`). With `OMP_NUM_THREADS=1` this takes about 10 minutes
on 4 cores.

## Sample, clock and outcome

- **First marriages (5,076; 1,906 dissolutions; 53,140 marriage-years; 50,592 person-years).**
  Of the 5,148 dated first marriages:
  - 158 created dates disagree with the monthly array (`MAR_IMPUTE_FIRST_MARRY` flags 159).
    The array's first married month is used when it lies within 12 months; it is usually 1
    month later.
  - 10 marriages with no such month are dropped.
  - 62 marriages identified as same-sex through the household roster are excluded, and the
    bundle abstains for same-sex couples.
- **Clock:** NLSY97 continuous months (1 = January 1980). The wedding month counts from its
  middle. A dissolution in month *e* ends exposure at *e*. A censored marriage counts through
  the end of its last valid month. Marriage-years (0 = first year) are Poisson intervals with
  survey weight × exposure.
- **Event:** the first month after the wedding in which the monthly array `MAR_STATUS` reads
  separated (3) or divorced (4). 665 dissolutions begin as separations and 1,237 as divorces.
  In 4 more, the created divorce date falls inside an observed marriage the array never closes,
  and the created date is used. Widowhood (42) and the last interview censor. Most respondents
  were last interviewed in 2023–24.
- **Weights:** round-1 sampling weight (cumulative cases), normalised to mean 1 over marriages.
  The NLS custom-weight program builds multi-round panel weights, but it is web-only and was
  not used, so attrition after round 1 is not reweighted. Every resample, fold and bootstrap is
  clustered on the respondent. Each respondent has one first marriage, so marriage = person.

## Predictors and their timing

Everything is measured at or before the wedding month unless the table says otherwise.
"Pre-wedding round" means the last interview strictly before the wedding month (median 8 months
before).

| Block | Input | Source and timing |
| --- | --- | --- |
| demographics | `sex`, `race_ethnicity` | KEY variables (fixed) |
| | `age_at_marriage` | wedding month − birth month |
| | `region`, `urban` | `CV_CENSUS_REGION`, `CV_URBAN-RURAL`, pre-wedding round |
| relationship history | `cohabited_first`, `cohab_months_before` | monthly `MAR_STATUS` = cohabiting with the same `MAR_PARTNER_LINK` partner, counted back from the month before the wedding |
| | `prior_cohabitations_band` | distinct earlier cohabiting partners (monthly arrays) |
| | `children_before_marriage` | biological child birth months (`CV_CHILD_BIRTH_DATE`, latest round) before the wedding month |
| | `pregnant_at_wedding` | a birth in the wedding month or the 7 months after (conceived before the wedding) |
| family background | `parent_max_grade` | higher of the biological parents' grades (1997; resident parents if missing) |
| | `family_at_12` | `CV_YTH_REL_HH_AGE_12` (1997): both biological parents, step, single parent, other. This is a **proxy** for parental separation. The direct items (`YHEA-3000` series) ask only about divorces in the last 5–6 years and were not used |
| | `poverty_ratio_1997` | household income / poverty line for 1996 |
| | `religion_raised` | own religious preference in 1997 (ages 12–16) |
| | `parent_attendance_1997` | parent questionnaire, 1997 |
| cognitive | `afqt_percentile` | ASVAB math-verbal percentile (tests 1997–98, before almost every wedding; 19% untested) |
| behaviour | `delinquency_1997`, `substance_1997` | NLS indices, 1997 self-report |
| | `first_sex` | `FP_SEXAGE` (2000) or `YSAQ-300` (2001) |
| | `attendance_before` | own worship attendance, pre-wedding round. Asked from 2000; earlier weddings are "not measured" |
| | `mhi5_before` | 5-item mental health inventory (`YSAQ-282C–G`), latest pre-wedding round of 2000–2010 or 2015 |
| economics and education | `education_at_marriage` | dated credentials (`CVC_GED`, `_HS_DIPLOMA`, `_AA_`, `_BA_`, `_MA_`, `_PHD_`, `_PROF_DEGREE`) on or before the wedding month |
| | `enrolled_at_marriage` | monthly `SCH_COLLEGE_STATUS` in the wedding month |
| | `hours_year_before` | `CVC_HOURS_WK_YR_ALL` for the calendar year before the wedding year |
| | `earnings_year_before_k` | `YINC-1700` for that calendar year (the year before, or two years before in the biennial rounds). It may be **reported** at an interview after the wedding, but the content is pre-wedding. A valid skip at an interview is taken as no wage income |
| | `net_worth_before_k` | household net worth at the age-20 or age-25 assets interview, used only if that interview preceded the wedding |
| partner traits | `spouse_age_gap` | spouse's age at starting to live together (`YMAR-3200`, asked of every newly listed partner) plus months of cohabitation, or the roster birth date |
| | `spouse_education`, `spouse_race_ethnicity`, `same_race_ethnicity` | **see below** |
| | `spouse_married_before`, `spouse_has_children` | `YMAR-4310`/`4315`, asked of partners first listed in 2011 or later. "Unknown" means first listed before 2011 |

**Excluded on timing grounds:**

- **TIPI personality** was asked in 2008 only, after most of these weddings. Using it would
  condition on still being unmarried in 2008.
- **CES-D** was asked from 2019 only. The pre-wedding MHI-5 is used instead.
- **Wedding year** was dropped after the first full run. In a five-year birth cohort it is almost
  birth year + age at marriage. Its contrast at fixed age (rate ratio 1.9 for 2016 versus 2002)
  is an extrapolation, and a wedding today lies outside 1995–2024. Removing it changed held-out
  gains by under 0.1 point.
- **The partner section's schooling, race, religion and work items** are asked only when a
  partner is **not** current at the interview where they are first listed (codebook universes).
  Current spouses are described on the household roster instead. Using the partner section alone
  would make "known spouse schooling" mean "already separated", which is outcome leakage.

**How spouse schooling and race-ethnicity are combined.** The household roster is used for a
spouse co-resident at the first interview at or after the wedding (4,502 marriages; median 7
months after the wedding). The partner section (asked about the start of living together) is
used for spouses not co-resident then (342). That leaves 232 with neither, and 734 marriages (14%)
miss at least one spouse trait, disproportionately couples who split before the next
interview. They are imputed without an outcome-aware category:

- spouse schooling by the most common spouse schooling for the respondent's own credential;
- race-ethnicity by the respondent's own group;
- the age gap by the sex-specific median.

**Sensitivity:** scored only on the 4,342 marriages with every spouse trait observed, the same
held-out predictions give 4.8% (boosting) and 4.5% (additive), against 4.9% and 4.7% on all
marriages (`sensitivity_spouse_traits_observed.csv`). The imputation does not drive the result.

## Models and validation

Every model predicts a Poisson rate per marriage-year, using `marriage_years` plus the fixed
inputs. Hyperparameters were fixed before any held-out score was seen. The GLM ridge penalty is
α = 1e-3. Numeric inputs are clipped to the ranges in the bundle's `inputs`.

| key | model |
| --- | --- |
| `duration_only` | quantile-knot spline of marriage length |
| `additive_spline` | uniform-knot quadratic splines (5 knots) on numeric inputs, one-hot categories, Poisson GLM. Uniform knots, because quantile knots repeat for inputs piled at zero and the browser engine could not reproduce a repeated-knot basis exactly |
| `spline_pairs` | the same, plus three derived pair categories: sex × age band, own × spouse schooling, cohabited × age band |
| `tree_depth3`, `tree_depth5` | Poisson regression trees (min leaf 2,000 / 1,000 intervals) |
| `gradient_boosting` | `HistGradientBoostingRegressor(loss='poisson')`, 150 trees of depth 3, learning rate 0.05, min leaf 400, L2 1.0 |

**Validation.** Folds are grouped by respondent: 5 folds, repeated with 3 seeds. All
preprocessing (imputation medians, knots, scaling, categories) is fitted inside each training
fold.

- Point estimates, 95% intervals, calibration and the population reference come from the first
  split, so each prediction comes from one fitted model. Averaging predictions across repeats
  would bag the trees and flatter them.
- `heldout_per_repeat.csv` gives all three splits.
- Intervals are 400 paired person-bootstrap replicates with the folds held fixed.

**Metrics.**

- **Deviance gain:** weighted Poisson deviance relative to the training-fold constant rate.
- **Harrell's C:** survey-weighted, on predicted 10-year cumulative hazard, pairs up to 20 years.
- **Uno's AUC(t):** cumulative cases against dynamic controls, inverse-probability-of-censoring
  weighted (weighted Kaplan–Meier of censoring), on the predicted 5- or 10-year cumulative hazard.
- **Decile lift:** observed rate (events per person-year in the first 10 years) in the top
  predicted decile over the bottom decile.
- **Calibration:** `heldout_calibration.csv` (exposure-weighted deciles of predicted rate) and
  `heldout_person_calibration.csv` (deciles of predicted 5- and 10-year dissolution against
  weighted Kaplan–Meier).

## Results

| Model | Deviance gain % (95% CI) | Mean of 3 splits (range) | Harrell's C | AUC 5 y | AUC 10 y | Top/bottom decile |
| --- | --- | --- | --- | --- | --- | --- |
| duration only | 0.55 (0.25–0.79) | 0.58 (0.55–0.60) | 0.49* | 0.48* | 0.49* | 1.1 |
| additive spline | 4.68 (3.92–5.46) | 4.82 (4.68–4.94) | 0.672 (0.660–0.685) | 0.691 (0.669–0.710) | 0.677 (0.660–0.694) | 11.6 (8.5–20.4) |
| spline + pairs | 4.62 (3.86–5.42) | 4.78 (4.62–4.90) | 0.672 (0.660–0.685) | 0.690 (0.668–0.710) | 0.676 (0.659–0.694) | 12.0 (8.4–21.0) |
| tree depth 3 | 2.69 (2.05–3.29) | 2.55 (2.37–2.69) | 0.637 (0.623–0.651) | 0.646 (0.625–0.666) | 0.648 (0.629–0.668) | 6.0 (4.4–9.0) |
| tree depth 5 | 2.68 (1.86–3.40) | 2.59 (2.37–2.71) | 0.647 (0.633–0.660) | 0.663 (0.642–0.681) | 0.653 (0.634–0.671) | 7.0 (4.9–9.9) |
| **gradient boosting** | **4.91 (4.23–5.52)** | 4.91 (4.80–5.03) | **0.677 (0.665–0.690)** | **0.697 (0.677–0.717)** | **0.686 (0.670–0.705)** | 10.1 (7.1–16.2) |

\*The duration-only curve gives everyone in a fold the same score, so its C and AUC are 0.5 by
construction. The small departures come from different curves in different folds.

**Calibration.** Observed/expected over all held-out intervals is 0.96 for boosting and 0.97 for
the additive GLM, so both over-predict slightly overall. By decile of predicted 10-year
dissolution, boosting predicts 9.3%, 14%, 18% … 50%, 62%; weighted Kaplan–Meier observes 9.2%,
14%, 20% … 50%, 61%. The additive GLM over-predicts its top decile more (66% against 60%).

**Pair interactions and deeper trees did not help.** The interactions add nothing over the
additive model (−0.06 points), echoing the NLSY79 couple models. Boosting's edge over the
additive GLM (+0.2 points, overlapping intervals) is within the noise.

### Feature-block ablations (additive spline, first split)

Gains are relative to a constant rate. The demographics block is sex, race-ethnicity, age at
marriage, region and urban.

| Variant | Gain % (95% CI) | C | AUC 10 y |
| --- | --- | --- | --- |
| duration + demographics | 2.15 (1.62–2.66) | 0.610 | 0.580 |
| + relationship history | 3.64 (3.05–4.25) | 0.651 | 0.643 |
| + family background | 2.94 (2.34–3.62) | 0.632 | 0.622 |
| + cognitive (AFQT) | 2.76 (2.21–3.36) | 0.628 | 0.612 |
| + behaviour | 3.19 (2.56–3.84) | 0.639 | 0.627 |
| + economics and education | 3.46 (2.90–4.16) | 0.647 | 0.643 |
| + partner traits | 3.80 (3.23–4.47) | 0.656 | 0.647 |
| all blocks | 4.68 (4.01–5.45) | 0.672 | 0.677 |

What the full model loses when one block is dropped, in points of gain (paired bootstrap 95% CI):

| Block dropped | Points lost |
| --- | --- |
| partner traits | **0.32 (0.14–0.50)** |
| relationship history | **0.23 (0.04–0.43)** |
| partner traits and relationship history together | **0.68 (0.37–1.00)** |
| behaviour | 0.07 (−0.14–0.32) |
| demographics | 0.05 (−0.13–0.23) |
| AFQT | −0.02 (−0.12–0.08) |
| family background | −0.04 (−0.20–0.12) |
| economics and education | −0.06 (−0.22–0.11) |

Each block alone predicts. Given everything else, only the **couple-level** blocks (who the
spouse is, and the relationship's history before the wedding) add information that the other
blocks do not already carry. AFQT, family background and economics overlap heavily with
schooling and the rest.

### Rate ratios (`additive_rate_ratios.csv`)

These are rate ratios of the final additive GLM at a reference profile. Numeric inputs compare
the 10th and 90th percentiles. The 95% intervals come from 100 person bootstraps. They are
adjusted associations, mutually confounded and not causal. The clearest:

| Input | Contrast | Rate ratio (95% CI) |
| --- | --- | --- |
| age at marriage | 34 vs 20 | 0.55 (0.44–0.68) |
| months living together before the wedding | 48 vs 0 | 0.68 (0.56–0.82) |
| cohabited first | no vs yes | 0.83 (0.72–0.94) |
| earlier live-in partners | 1 vs 0 | 1.19 (1.09–1.31) |
| | 2+ vs 0 | 1.33 (1.16–1.50) |
| own children before the wedding | 2+ vs 0 | 1.17 (1.02–1.30) |
| spouse's schooling | 16+ years vs 12 years | 0.64 (0.56–0.71) |
| own bachelor's degree | vs high school | 0.76 (0.64–0.86) |
| AFQT | 90th vs 10th percentile | 0.76 (0.61–0.88) |
| MHI-5 mental health | 87 vs 53 | 0.72 (0.61–0.81) |
| substance-use index (1997) | 3 vs 0 | 1.20 (1.02–1.38) |
| earnings the year before | $60k vs 0 | 0.75 (0.60–0.98) |
| at 12, lived with | other arrangement vs both biological parents | 1.45 (1.21–1.73) |
| | single biological parent vs both | 1.16 (1.06–1.29) |
| | a parent and a step or other parent vs both | 1.18 (1.06–1.33) |
| spouse has children from before | yes vs no | 1.23 (1.08–1.41) |
| spouse married before | yes vs no | 1.15 (1.01–1.32) |
| region | Northeast, North Central or West vs South | 0.85–0.86 |
| own weekly worship before the wedding | vs never | 0.86 (0.75–0.99) |

Two coefficients need care:

- The cohabitation coefficients are **conditional on cohabitation length**. They are not the raw
  cohabitation contrast. Weighted Kaplan–Meier gives 67.3% (cohabited first) and 68.3% (did
  not) still married at 10 years.
- Sex, race-ethnicity, religion raised, parental schooling, poverty, delinquency, age at first
  sex, being pregnant at the wedding, the age gap and urban residence show no clear adjusted
  association once the rest is held fixed.

### Descriptive survival (`weighted_survival.csv`)

Weighted Kaplan–Meier, overall: 81.6% of first marriages still intact at 5 years, 67.7% at 10
and 52.0% at 20.

| Group | Still married at 10 years |
| --- | --- |
| married under 22 | 52.7% |
| married at 30 or older | 76.2% |
| no high-school credential | 46.8% |
| bachelor's degree | 85.8% |
| graduate degree | 87.5% |

## Bundle contents (`app/models/nlsy97_first_marriage.json`)

The bundle carries the six models in the engine's format, each with held-out metrics, intervals,
the spread across splits and calibration. It also has:

- `comparison`, `ablation` and `weighted_survival`;
- `ood`: the squared Mahalanobis distance on the fixed inputs, as a percentile among held-out
  people (`app/tools/ood.py`, first split; abstain above the 99th percentile);
- `support`: the central 99% of marriages; marriage years 0–23 have at least 50 at risk;
- `timing`, `abstain` and plain-language `inputs`, including how the app derives the pair
  categories.

**`population_reference`:** this block is in the standard shape `app/population.js` reads:
`{horizons: [5, 10, 20], overall: {n, quantiles: {p1..p99: [one value per horizon]}}, subgroups:
{<var>: {<level>: {n, quantiles}}}, subgroup_defs}`.

- Each value is a survey-weighted quantile of each marriage's held-out predicted probability of
  separation or divorce within 5, 10 and 20 years of the wedding.
- The lens number is 1 − the mean, over the five scoring models (baseline excluded), of
  exp(−cumulative hazard), as in the NSFG lenses.
- Overall median: 17% at 5 years, 30% at 10 years and 47% at 20 years. The 10th to 90th
  percentiles at 10 years run from 12% to 51%.
- Subgroups: sex, age-at-marriage band, education at marriage, race-ethnicity, cohabited first,
  family structure at 12 (the parental-separation proxy), AFQT tercile (with bin edges in
  `subgroup_defs`) and pre-wedding worship attendance.
- Cells need at least 100 marriages, and each records its n.
- The 20-year horizon rests on about 300 marriages still at risk in year 20.

**`partner_distribution`:** weighted shares of spouse age gap, spouse schooling, spouse
race-ethnicity and spouse prior marriage, conditional on coarse respondent bands, among
marriages with every spouse trait observed.

- Rows need at least 30 marriages.
- Spouse categories with fewer than 30 are folded into `suppressed_share`.
- It describes who married whom; it is not advice.

Test vectors (`nlsy97_first_marriage_testvectors.json`, 80 profiles including nulls and
out-of-range values) are checked to 1e-9 by `app/tests/nlsy97.test.mjs`, together with the
`ood` distances.

## Caveats

- **One cohort, one country.** The data cover people born 1980–84 who married at 16–41, mostly
  in 2000–2015. The bundle has no wedding-year input, so the period effect of a wedding today is
  not modelled.
- **Respondent-side first marriages only.** The respondent may have a previously married spouse
  (that is an input), but the bundle cannot score a respondent's second marriage.
- **Attrition.** Round-1 weights do not adjust for later non-response. The custom panel weights
  are web-only.
- **Separation is the event.** Many separations end in divorce later, and a few reconcile.
  `MAR_STATUS` separated is legal or reported separation, not every informal break-up.
- **Spouse measurement.** Spouse schooling comes from the roster a median of 7 months after the
  wedding, so a spouse still in school can look better educated than at the wedding. The
  partner-section schooling refers to the start of living together.
- **Missing pre-wedding measures.** Missing AFQT, poverty ratio, MHI-5, earnings and net worth
  are imputed by the training median with no missing-indicator, so a user who leaves them blank
  gets a median, not a "missing" effect. Their missingness is partly structural: no MHI-5 or
  asset interview before an early wedding.
- **Associations only.** Nothing here identifies what would happen if a couple changed an input.
  The modest discrimination (C ≈ 0.68) means that most marriages, including high-scoring ones,
  last, and many low-scoring ones end.

## 2026-10-20 extension: race detail, family of origin, religion, politics, occupation and wealth (`extended_predictors.py`)

`select_vars_ext.py` streams 89 more columns from the same zip (`extract_ext.csv`); every new input
is fixed at or before the wedding month:

- `race_detail`: KEY!RACE × KEY!ETHNICITY (Hispanic; non-Hispanic White, Black, American Indian or
  Alaska Native, Asian or Pacific Islander — one category in NLSY97 — and other). Only 74 Asian or
  Pacific Islander and 21 AIAN first marriages.
- `family_origin`: parent figures at 12 (CV_YTH_REL_HH_AGE_12) and whether a biological parent had
  died by 1997 (YSAQ-057/146): both parents / a parent died / stepfamily / single parent / other.
  NLSY97 cannot separate a divorced or separated parent from a never-married one: the age-2
  parent-figure variable almost never differs from the age-12 one, and the direct parental-divorce
  items (YHEA-3021) cover only divorces in the five years before 2002-2013 interviews.
- Religion: worship attendance at all eight answers ("several times a week" and "every day"
  separate), the four belief items asked 2002-2011 (prays more than once a day; teachings to be
  obeyed exactly; asks God's help; does not need religion for good values), importance of faith
  (2008, 2011) and the parent-reported religiosity index (1997), each at the last answer before the
  wedding.
- Politics: interest in public affairs (YPOL-105, 2004-2010). NLSY97 asks no party or ideology.
- Occupation: first-listed employer's occupation (2002 Census codes) at the last interview before
  the wedding, Census major group.
- Wealth: financial assets, debts and home ownership at the age-20/25 assets interview, only if it
  preceded the wedding (net worth was already an input).

Same marriages, intervals, folds (the first 3 seeds of `train_models.py`) and additive spline GLM;
paired person bootstrap of the held-out difference (1,000):

| Variant | Deviance gain % (95% CI) | Minus current, points (95% CI) |
| --- | --- | --- |
| current model | 4.82 (4.07–5.61) | — |
| race detail (replaces 3-group race) | 4.82 (4.04–5.62) | −0.00 (−0.02 to +0.02) |
| family of origin, 6 levels | 4.81 (4.04–5.61) | −0.02 (−0.06 to +0.03) |
| family at 12 as yes/no | 4.79 (4.01–5.59) | −0.03 (−0.09 to +0.03) |
| religion detail | 4.70 (3.94–5.51) | −0.12 (−0.22 to −0.03) |
| political interest | 4.80 (4.05–5.62) | −0.02 (−0.08 to +0.04) |
| occupation before the wedding | 4.80 (4.04–5.59) | −0.02 (−0.07 to +0.03) |
| wealth components | 4.75 (3.98–5.53) | −0.07 (−0.17 to +0.03) |
| all new blocks | 4.57 (3.77–5.35) | −0.26 (−0.43 to −0.09) |

**Nothing adds held-out skill**; the religion block and all blocks together make predictions
slightly worse. Adjusted rate ratios (`extended_rate_ratios.csv`, every current input and a
marriage-length spline, 200 person-bootstrap refits) — a single parent at 12 1.18 (1.03–1.31),
"other" arrangements 1.66 (1.32–2.01), a parent died 1.13 (0.88–1.38), stepfamily 1.15
(0.88–1.41) vs both parents; Asian or Pacific Islander 0.71 (0.34–1.09) vs White; attendance
several times a week 0.78 (0.56–1.04) vs never; faith "not important at all" 1.39 (1.05–1.88) vs
"somewhat important"; following public affairs most of the time 1.20 (1.01–1.48); no occupation
group differs clearly from management and professional jobs. The bundle gains `models_extended`
(current + all blocks) and `extended` test vectors for transparency.
