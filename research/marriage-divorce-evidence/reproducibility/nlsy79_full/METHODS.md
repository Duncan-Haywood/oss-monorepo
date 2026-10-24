# NLSY79 from the full public release: reproduction of the couple models, and first marriages from the wedding

This folder works from the **official NLSY79 public release, all rounds 1979–2022**
(`nlsy79_all_1979-2022.zip`, U.S. Bureau of Labor Statistics via nlsinfo.org, no login). It
does two things:

1. **Reproduces** the existing couple models (`../ml_couples`), whose person-level inputs were
   never in git, straight from the public archive, and says where the result differs.
2. **Adds a new lens:** every NLSY79 first marriage that began in 1981 or later, followed from
   the wedding month, with predictors measured before the wedding and the spouse observed at the
   first interview after it. The existing NLSY79 couple lens starts in 2000 at ages 35–64; this
   one covers weddings at ages 16–63, mostly in the respondents' twenties.

Everything committed here is code, aggregate tables and fitted parameters. The extracts, the
person-level marriage table and the cross-validation cache stay in `work/` (gitignored).

## Source and verification

- **Archive:** `https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip`, 450,128,335 bytes,
  SHA-256 `efb3bbd1…72d7` (`SHA256SUMS`), the same file and checksum recorded in
  `../longitudinal/source_manifest.json` when the original analyses were built. `download.sh`
  fetches and checks it. The CSV inside is 6.7 GB with 178,014 columns and 12,686 rows.
- **Never unzipped.** `extract_nlsy79_full.py` streams the CSV member row by row and writes only
  the selected columns, in one pass (about 6 minutes), into three extracts:
  `annual_nlsy_extract.csv` (280 columns) and `pairing_nlsy_extract.csv` (517 columns), built with
  the exact selection rules of `../annual_nlsy/extract_annual_nlsy.py` and
  `../pairing_nlsy/extract_pairing_nlsy.py`, and `lens_extract.csv` (2,641 columns) for the new lens.
  The two re-derived codebooks are identical, key for key and block for block, to the committed
  `annual_nlsy_codebook.json` and `pairing_nlsy_codebook.json`.
- **Terms:** NLSY79 public-use data may be used for statistical research; users must not try to
  identify respondents. The repository commits no person-level rows; every published table cell
  and reference quantile has a minimum count (below).

## 1. Reproducing the couple models (`reproduce_ml_couples.py`)

The script copies the four upstream scripts **unchanged** into a scratch tree, adds the
extracts, runs `annual_nlsy` (both variants), `pairing_nlsy`, `couple_profiles` and
`ml_couples/train_models.py` in the environment `ml_couples/feature_manifest.json` pins
(Python 3.11, numpy 2.3.4, pandas 2.3.3, scikit-learn 1.7.2), and compares every audit and
held-out table with the committed copy (`reproduction_check.json`).

**Sample: recovered exactly.** 40,818 intervals, 5,735 respondents, 726 divorces,
82,039 person-years, 1,962 both-zero-wage and 4,040 missing-wage intervals, the same five
respondent folds (test divorces 133/146/151/156/140). `pairing_audit.json` and the primary
`legally_married_primary/annual_audit.json` are identical too.

**Held-out skill: recovered to within 0.005 percentage points.**

| Model | Committed gain | Reproduced gain |
| --- | --- | --- |
| Additive core | 3.1084% | 3.1069% |
| **Additive enriched** | **3.4016%** | **3.3988%** |
| Spline + pair interactions | 2.8904% | 2.8899% |
| Poisson tree, depth 2 | 2.4303% | 2.4303% (identical) |
| Poisson tree, depth 3 | 2.3086% | 2.3086% (identical) |

**Why it is not bit-identical.** The upstream scripts take survey-weighted quartiles (family
income, couple wages, individual wages) after `np.argsort`'s default, *unstable* sort, then
interpolate the weighted CDF. When incomes tie (many are round numbers such as $45,000), the
order of the tied rows, and so the interpolated cutpoint, depends on which SIMD sort kernel numpy
picks for the CPU. Here (Intel Xeon with AVX-512) the 2000 couple-wage Q1 cutpoint is $44,986.4
instead of the committed $45,000.0, and similar small shifts occur in a few other wave/quantile
cells. Under the final cutpoints that moves 59 of 40,818 intervals across a couple-wage quartile
boundary; the family-income and individual wage bands do not change.
That is enough to move GLM coefficients on the quartile dummies (largest change 0.018 on the log
scale) but not the trees, whose splits never use those dummies. Rerunning with numpy's AVX-512
kernels disabled (`--avx512-off`, `reproduction_check_avx512_off.json`) restores some committed
cutpoints (e.g. $45,000.0) but not all (enriched gain 3.3969%), so the committed run's exact tie
order cannot be recovered from this machine. The root-folder `annual_nlsy/annual_audit.json`
(the older currently-married sensitivity) also differs (42,259 vs 42,271 intervals); it is not an
input to the couple models, and its committed copy is inconsistent with the committed primary
file's married subset (42,259), so it was most likely written by an earlier version of the script.

**Consequence.** The committed couple models are reproducible from public data up to a
tie-ordering artefact that changes held-out skill in the third decimal. That was close enough to
compute the two blocks the couple bundle lacked: `app/tools/nlsy79_reference.py` adds
`ood` and `population_reference` to `app/models/nlsy79_couples.json` and leaves every other
byte unchanged (it refuses to run unless the sample is identical and every held-out gain is within
0.01 points of the committed one).

- `ood`: squared Mahalanobis distance on the 16 couple inputs the models see (both spouses'
  schooling tiers, the four wage/income bands from the committed final cutpoints, earnings role,
  sex, marriage order, own degree, work hours, attendance, age, marriage length, first-marriage
  age, wife's wage share; survey wave excluded), scored against held-out couple-intervals in the
  committed respondent folds. Held-out median d² 44.5, 99th percentile 189.8.
- `population_reference`: survey-weighted quantiles (p1, p5, p10…p90, p95, p99) of the held-out
  predicted annual divorce rate of the additive enriched model over the 40,818 couple-intervals,
  overall and by sex, age band, marriage length, marriage order, both spouses' schooling,
  earnings role, couple-wage band, own degree and attendance (cells ≥ 100 intervals; 44 cells).
  Overall median 0.66% a year (p5 0.17%, p95 2.14%). `p10_constant_rate` is the 10-year
  probability if that rate held, labelled as such. These are couple-years at ages 35–64, not
  weddings.

## 2. First marriages from the wedding (`build_first_marriages.py`, `train_first_marriage.py`)

### Sample

From the cross-round marital history (`MOBG1M`/`YRBG1M`, `MOEN1M`/`YREN1M`) of all 12,686
respondents (`first_marriage_sample_audit.json`):

| Step | Count |
| --- | --- |
| Never married | 2,526 |
| No dated first marriage (start month/year missing) | 275 |
| First wedding before January 1981 (predictors would post-date it) | 2,836 |
| First marriage ended but its end year is missing (excluded; a selection limit) | 278 |
| No interview after the wedding | 3 |
| **First marriages begun January 1981 – 2022** | **6,768** (2,810 divorces) |
| Ended before the first post-wedding interview (not at risk at entry) | 83 |
| Spouse in the roster of unconfirmed (possibly same) sex, or an ambiguous roster | 40 |
| **Analysis sample** | **6,645 marriages, 2,727 divorces, 264 widowhoods (censored), 116,985 marriage-years, 110,538 person-years** |

Weddings: 3,284 in 1981–85, 1,922 in 1986–90, 1,097 in 1991–2000, 342 in 2001–22; ages at the
wedding 16.6–62.8 (central 99%: 17.8–55.2). Follow-up runs to the respondent's last interview
(2022 for most), up to 42.5 years.

**Outcome.** The first marriage's end month, unless the respondent was widowed: an end counts as
widowhood (censored) when the first interview at or after it records marital status 6 or a
1996+ marital-change record of type 6 dated within a month of it. 1,332 of the 2,810 ended,
non-widowed first marriages show a *separated* status at an interview strictly between the
wedding and the end date, so the end date is the **legal divorce**, not the separation; this is
the same target as the existing NLSY79 couple lens, and differs from the NSFG lenses, which count
separation. 74 ends with a valid year but no month are placed in July (flagged
`end_month_imputed`). Dates are months, placed mid-month.

**Entry and time scale.** Marriage years count from the wedding month. A marriage enters the
risk set at the first interview after the wedding (median 8 months after; delayed entry), because
that is when the spouse is first observed; exposure before entry is not used. This keeps the
spouse inputs free of outcome leakage: a marriage that ended before the spouse could be recorded
is not in the risk set, rather than in it with a missing spouse. The cost is the first months of
marriage, which a sensitivity below restores.

### Predictors and their timing

| Input | Source | Measured |
| --- | --- | --- |
| `age_at_marriage`, `wedding_year` | wedding month − birth month (`Q1-3_A~M/Y`) | at the wedding |
| `own_education`, `enrolled` | `HGCREV##`, `ENROLLMTREV##` | last interview before the wedding ("pre-wedding round", median 7 months before; 3% more than 2 years before) |
| `income_percentile`, `poverty` | `TNFI_TRUNC` as a weighted percentile among everyone interviewed that round; `POVSTATUS` | pre-wedding round (income of the previous calendar year; for young respondents living with parents it is the parents' family income) |
| `region`, `urban` | `REGION`, `URBAN-RURAL` | pre-wedding round |
| `cohabiting_before`, `lived_with_parents` | household roster (`HHI_FINAL_RELCODE` 33 partner; 4/5/37/38 parent or step-parent) | pre-wedding round (a partner listed then need not be the later spouse) |
| `premarital_birth` | children's birth months (`C#DOB~M/Y`, cross-round) | before the wedding month |
| `family_at_14`, `mother_education`, `father_education`, `religion_raised` | `FAM-7`, `HGC-MOTHER`, `HGC-FATHER`, `R_REL-1_COL` | 1979 (retrospective/background) |
| `attendance` | `R_REL-3` | 1982 if that interview preceded the wedding (5,677), else 1979 (1,007) |
| `rotter` | `ROTTER_SCORE` | 1979 |
| `rosenberg`, `delinquency` | `ROSENBERG_ESTEEM_SCORE`; count of the 18 delinquency items asked of everyone (`DELIN-4`…`DELIN-21`) done at least once in the past year | 1980 interview |
| `afqt` | `AFQT-3` (2006 revision, percentile) | ASVAB, summer–autumn 1980 |
| `sex`, `race` | `R0214800`, screener cohort `R0214700` | fixed |
| `spouse_age_at_marriage`, `spouse_education`, `spouse_worked`, `spouse_in_household` | the one roster member coded spouse (`HHI_FINAL_RELCODE`=1, opposite sex): age minus time since the wedding, highest grade, worked in the previous calendar year | first interview after the wedding (= entry) |

Every 1979–80 measure precedes every wedding in the sample, because the sample starts with
January 1981 weddings. Missing numbers are median-imputed inside each training fold and carry an
explicit `*_missing` flag where more than 4% are missing (AFQT 4.5%, Rosenberg 4.3%,
delinquency 6.1%, income 17.1%; spouse age, 8.9%, is missing mostly when no spouse was in the
household, which `spouse_in_household` carries); missing categories are an `Unknown` level, which the app should
not offer. Parents' and spouses' schooling are banded (<12, 12, 13–15, 16+ grades) because their
heavy ties at 12 make quantile spline knots coincide. **Not available before the wedding:** the
spouse's religion, earnings and family background, relationship quality, and premarital
cohabitation with the spouse other than a partner listed at the pre-wedding interview.

### Models and validation

Fits use the NLSY79 sampling weight of the pre-wedding round (normalised to mean 1) times
exposure, with the annual rate event/exposure as the Poisson target, as in the other lenses.

- **Constant:** the training-fold rate. **Duration only:** a quadratic spline in
  `marriage_years` (5 quantile knots).
- **Additive spline Poisson:** quadratic splines (4 quantile knots, linear extrapolation) for
  the 9 numeric inputs and one-hot categories; `PoissonRegressor`, alpha 1e-4.
- **Spline + pair interactions:** the same plus three pair categories
  (`education_pair` own × spouse schooling, `age_pair` own × spouse age band, `sex_age_band`).
- **Poisson tree, depth 3** (≥ 3,000 intervals per leaf) and **Poisson gradient boosting**
  (`HistGradientBoostingRegressor`, 150 trees of depth 3, learning rate 0.05, ≥ 1,000 intervals
  per leaf, L2 1.0). Settings were fixed before scoring; nothing was tuned on held-out folds.

**Validation:** 5-fold cross-validation by marriage (one marriage per person, so by person),
repeated 3 times with different seeded shuffles (seeds 20261019+r). Every metric below is
computed on held-out predictions only. Deviance gain is 1 − held-out weighted Poisson deviance /
that of the constant rate (mean of the 3 repeats; `heldout_by_repeat.csv`, `fold_metrics.csv`).
Discrimination uses each marriage's held-out predicted probability of divorce by year h from the
wedding, 1 − exp(−Σ rate), averaged over the repeats: weighted Harrell's C (score: 10-year
probability; comparable pairs respect delayed entry) and cumulative/dynamic AUC at 5, 10 and 20
years with inverse-probability-of-censoring weights (Kaplan–Meier of censoring with delayed
entry). 95% intervals resample marriages 500 times (survey weight × resample count) with the
fitted models held fixed, so they cover sampling of people, not refitting. Models without couple
inputs have C = AUC = 0.5 by definition.

### Results

| Model | Held-out deviance gain (95% CI) | Gain over duration only | Harrell's C | AUC 5y | AUC 10y | AUC 20y | O/E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Duration only | 2.31% (1.84–2.68) | — | 0.5 | 0.5 | 0.5 | 0.5 | 1.000 |
| Additive spline Poisson | 5.07% (4.37–5.79) | 2.83% (2.32–3.48) | 0.655 (0.642–0.668) | 0.688 (0.665–0.712) | 0.696 (0.677–0.713) | 0.675 (0.658–0.693) | 0.982 |
| Spline + pair interactions | 5.06% (4.42–5.83) | 2.82% (2.30–3.52) | 0.655 (0.642–0.668) | 0.686 (0.662–0.711) | 0.692 (0.674–0.709) | 0.677 (0.659–0.695) | 0.974 |
| Poisson tree, depth 3 | 3.05% (2.85–3.82) | 0.76% (0.62–1.48) | 0.602 (0.589–0.616) | 0.625 (0.603–0.652) | 0.621 (0.601–0.639) | 0.620 (0.603–0.639) | 0.995 |
| **Poisson gradient boosting** | **5.60% (5.05–6.36)** | **3.37% (3.00–4.09)** | 0.656 (0.644–0.668) | 0.700 (0.677–0.724) | 0.694 (0.677–0.713) | 0.677 (0.660–0.694) | 0.973 |

Repeat-to-repeat range of the gain: additive 4.96–5.18%, boosting 5.50–5.66%, pairs 4.89–5.21%.
Boosting has the best point estimate; its interval overlaps the additive model's, and the
additive and pair models are indistinguishable, so the pair interactions add nothing. As in the
other lenses, most of what ends a marriage is not in these variables, but the gain from the
wedding (5–6%) is larger than the midlife couple lens's 3.4% (a different population and
baseline, so not directly comparable), and a held-out C of 0.66 / 10-year
AUC of 0.69–0.70 is a modest, real ranking.

**Calibration** (`heldout_calibration.csv`, ten exposure-weighted bins of predicted annual rate):
additive observed 0.54% → 6.53% a year from the lowest to the highest bin against predictions
of 0.45% → 6.74%; boosting 0.51% → 6.62% against 0.58% → 6.28%. At the person level
(`horizon_calibration.csv`), deciles of predicted 10-year divorce run from 9.6% to 59.3% (additive)
against Kaplan–Meier 9.7% to 55.6%: the additive model over-predicts deciles 2–6 by 1–3 points;
boosting is noisier (decile 7 over by 4 points, decile 9 under by 5). Overall O/E is 0.97–0.98.
**Lift** (`decile_lift.csv`, boosting): the top decile of predicted 10-year risk
divorces by year 10 at 2.08 times the overall Kaplan–Meier rate (53.9% vs 26.0%), the bottom
decile at 0.35 times (9.2%).

**Ablation** (`ablation.csv`; the additive model refitted without each block, first repeat,
paired person-bootstrap 95% CI of the *loss* in held-out gain, full model 4.96%): the spouse block
matters most (loss 0.54 points, CI 0.30–0.82), then age at marriage with wedding year (0.40,
0.17–0.63) and 1980 delinquency (0.19, 0.05–0.34). The pre-wedding household (cohabiting
partner, living with parents; 0.08, −0.02 to 0.18), religion (0.04, −0.06 to 0.15) and
region/urban (0.04, −0.07 to 0.16) intervals include zero. Removing own schooling, AFQT, race,
sex or income/poverty changes nothing measurable (|loss| ≤ 0.04), and removing Rotter/Rosenberg
(loss −0.08, CI −0.14 to −0.03), premarital birth (−0.02, −0.03 to −0.01) or parents'
schooling/family at 14 (−0.09, −0.20 to 0.01) slightly *improves* held-out skill, i.e. those
inputs overfit in this model. Most of them are correlated with what remains (own schooling with
the spouse's, AFQT and parents' schooling), so "no unique held-out contribution" is not "no
association": the weighted survival table shows large crude differences by own schooling
(10-year still married 86% with 16+ grades vs 60% with <12) and by family at 14.

**From the wedding day, without the spouse** (`from_wedding_sensitivity.csv`): all 6,768
marriages (including the 83 that ended before the first interview) with entry at the wedding
and every respondent input except the spouse block: duration-only 2.39%, additive 4.44%
(one repeat). The delayed-entry sample without the spouse block gains 4.42% (ablation), so the
respondent's own pre-wedding traits carry most of the signal and the delayed-entry design does
not change it. The first-year observed rate is 0.93%/year from the
wedding versus 1.30%/year for the delayed-entry marriage-year 0 (late first year only), which
is consistent with legal divorces rarely being final in the first months.

**Partial effects of the final additive model** (`additive_partial_effects.csv`; rate ratio
when one input changes, everything else at the median/most common level): age at marriage 18 →
2.36, 20 → 1.62, 25 → 0.98, 32 → 0.64, 38 → 0.50 (reference ≈24.8); own schooling 16+ grades
0.79 vs 12; spouse schooling 16+ 0.66 and <12 1.18 vs 12; spouse not in the household at the
first interview 1.72; delinquency 0 → 0.85 and 8 acts → 1.34 (reference 3); weekly attendance
0.82 vs several times a year or less; living with a parent at the pre-wedding interview 0.78;
enrolled in school 0.84; poverty 1.14. These are associations conditional on the other inputs,
not causes.

### What the bundle carries (`app/models/nlsy79_first_marriage.json`)

The five fitted models (engine kinds `poisson_glm`, `tree`, `boosted`) with held-out gain, CI,
C, AUCs and decile calibration; `inputs` and `timing` (the table above); `support` (central 99%
of each numeric input; marriage years 0–41, the last year with ≥ 50 marriages at risk);
`abstain`; the ablation; weighted Kaplan–Meier survival by group; and three reference blocks:

- `ood` (`app/tools/ood.py`): squared Mahalanobis distance on the 30 fixed inputs (8 numeric,
  22 categorical; marriage length excluded), percentile against held-out marriages (first
  repeat's folds). Held-out median d² 50.6; abstain above the 99th percentile (d² ≈ 278).
- `population_reference`: survey-weighted quantiles (p1, p5, p10, p15 … p90, p95, p99) of the
  held-out predicted probability of divorce within 5, 10, 20 and 30 years of the wedding from the
  gradient-boosting model (the best held-out), overall and by sex, age-at-marriage band,
  education, race-ethnicity, AFQT tercile (weighted), family at 14, religion raised and
  attendance; 31 cells, each ≥ 100 unweighted marriages, with `n`. Overall medians 12.6%, 24.4%,
  39.5% and 46.7%; by age at marriage the 10-year median runs from 44.5% (<20) to 18.4% (35+), by
  education from 38.8% (<12 grades) to 13.8% (16+). The 30-year figure is a projection of the
  duration curve for weddings after 1992.
- `partner_distribution`: survey-weighted joint shares of the spouse's age band and schooling
  band given the respondent's sex × age band and sex × schooling (18 tables), spouses in the
  roster only; cells under 30 marriages are pooled into `suppressed_share`.

Test vectors (60 random rows plus the spline knots of every numeric input) are in
`nlsy79_first_marriage_testvectors.json`; `app/tests/nlsy79_first_marriage.test.mjs` checks every
model and the ood distance against Python to 1e-9 relative, and the cell-size rules.

### Limits

- **One cohort, one period.** Respondents were born 1957–64; 78% of the weddings are 1981–90.
  Weddings after 2000 (342) are few and are all late first marriages (ages ~36+), so
  `wedding_year` beyond ~2016 is extrapolation; hold it at the support bound. Later cohorts
  marry later and divorce less.
- **Left out:** first marriages before 1981 (2,836, the youngest brides and grooms of the
  1957–61 births) and ended marriages with no end year (278). Both remove high-risk marriages, so
  absolute rates here are likely somewhat low for the whole cohort.
- **The spouse is seen once, after the wedding.** Spouse age and schooling barely change, but
  `spouse_worked` refers to the calendar year before that interview: the wedding year or the
  year before it. Same-sex couples are not represented (35 unconfirmed rosters excluded).
- **Legal divorce only.** Separation without divorce is not an event, deaths of the respondent
  end follow-up, and widowhood is censored (264). Weights are the pre-wedding round's
  cross-sectional weights; survey PSU/strata are not used, so intervals are approximate.
- **Associations, not causes**, and modest discrimination: a C of 0.66 means the models order a
  random divorcing/later-divorcing pair correctly two times in three.

### Reproduce

```sh
sh download.sh                                     # 450 MB, checks SHA-256
python3 extract_nlsy79_full.py raw/nlsy79_all_1979-2022.zip work     # ~6 min, three extracts
python3 reproduce_ml_couples.py work work/repro [PYTHON-3.11-with-pins]   # ~15 min; writes reproduction_check.json
python3 ../../app/tools/nlsy79_reference.py work/repro/reproducibility/ml_couples
python3 build_first_marriages.py work              # ~30 s; first_marriages.csv + first_marriage_sample_audit.json
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python3 train_first_marriage.py work   # writes the tables and the bundle
node --test ../../app/tests/nlsy79_first_marriage.test.mjs
```

`train_first_marriage.py` caches each cross-validation repeat in `work/cv_cache/` and can fill
the cache in parallel (`python3 train_first_marriage.py work --warm r0 r1 r2 ablation:0 …`).
Set `OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1`: on a shared 4-core machine multithreaded BLAS
and OpenMP made fits 10–50 times slower. Needs numpy, pandas and scikit-learn 1.7.2.

## 2026-10-20 extension for the first-marriage lens (`extract_ext.py`, `extended_predictors.py`)

`python3 -I extract_ext.py raw/nlsy79_all_1979-2022.zip work` streams 74 more columns;
`python3 extended_predictors.py work` tests them. Every wedding is in 1981 or later, so the 1979
items precede it; occupation and net wealth are taken from the last interview before the wedding.

- `race_detail`: the screener cohorts, with non-Black non-Hispanic respondents split by their first
  racial/ethnic origin in 1979 (FAM-30_1): 59 Asian or Pacific Islander origin, 218 "American Indian"
  origin (NLS warns this origin was overstated in 1979). NLSY79 has no finer race.
- `family_at_14_detail` (FAM-7 at full detail): both parents / mother and stepfather / father and
  stepmother / mother only / father only / relatives / other. **The 1979 survey did not ask why a
  parent was absent**, so divorce, death and never-married parents cannot be told apart.
- `siblings` (FAM-28A); `attendance6` (R_REL-3 at all six answers, so "more than once a week" is
  separate; 1982 if before the wedding, else 1979); `religion_1979` (current affiliation in 1979).
- `occupation_group` (CPS current or last job, 1980 Census codes from 1982 and 1970 codes before;
  major group); `net_worth_before_k` (family net wealth TNFW, asked from 1985: 3,733 marriages have
  a pre-wedding value, the rest are "not measured" with the median imputed).
- Politics: party affiliation was asked only in 2008 (ATT-POL-78), after almost every wedding in
  this lens, so it is not usable here (the NLSY79 couples lens uses it; `politics_nlsy/`).

Same 6,645 marriages, delayed-entry intervals, person folds (5 × 3 seeds) and additive spline GLM;
paired person bootstrap (1,000):

| Variant | Deviance gain % (95% CI) | Minus current, points (95% CI) |
| --- | --- | --- |
| current model | 5.07 (4.34–5.78) | — |
| race detail | 5.06 (4.32–5.76) | −0.02 (−0.03 to −0.00) |
| family at 14, full detail | 5.09 (4.33–5.80) | +0.01 (−0.02 to +0.05) |
| + siblings | 5.11 (4.36–5.83) | +0.04 (−0.06 to +0.14) |
| religion detail | 5.04 (4.30–5.76) | −0.03 (−0.08 to +0.02) |
| + occupation before the wedding | 5.03 (4.29–5.76) | −0.04 (−0.10 to +0.02) |
| + family net wealth before the wedding | 5.09 (4.36–5.81) | +0.02 (−0.08 to +0.11) |
| + all new blocks | 5.07 (4.31–5.85) | −0.01 (−0.16 to +0.15) |

**Nothing adds held-out skill.** Adjusted rate ratios (`extended_rate_ratios.csv`, 150 person
refits): each extra sibling 0.96 (0.94–0.98); attendance more than once a week 0.83 (0.64–0.99)
and once a week 0.84 (0.71–1.00) vs not at all; $100,000 more family net wealth before the
wedding 0.90 (0.80–0.99); mother only at 14 1.12 (0.98–1.29), mother and stepfather 1.06
(0.89–1.32) vs both parents; Asian or Pacific Islander origin 1.19 (0.76–1.82); service jobs 1.19
(0.97–1.39) vs management and professional. `models_extended` (all blocks) and its test vectors
are in the bundle for transparency.
