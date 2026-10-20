# SIPP marital histories: first-marriage survival and a prospective couple model

Two evidence lenses from the U.S. Census Bureau's Survey of Income and Program
Participation (SIPP). Both are public-use files that need no login.

1. **Retrospective first marriages** (`train_retro.py` → `app/models/sipp_first_marriage.json`):
   how long first marriages last from the wedding year, in five independent weighted
   cross-sections. 176,303 first marriages, 60,868 dissolutions.
2. **Prospective couples** (`train_prospective.py` → `app/models/sipp_prospective_couples.json`):
   whether a married couple living together separates or divorces in the next calendar
   year, using both spouses' traits and the household's income, wealth and debt measured
   beforehand. 33,698 couple-years, 312 separations or divorces.

The two answer different questions (lifetime of a first marriage from the wedding vs. a
one-year transition of any current marriage), so they are separate bundles and are never
pooled.

## Sources and verification

| Survey | File(s) | Interviews | People kept |
| --- | --- | --- | --- |
| 2001 panel, wave 2 | `2001/w2/p01putm2.zip` + `2001/p01putm2.sas`, dictionary `2001/w2/p01ptm2d.txt` | Jun–Sep 2001 | 40,887 ever-married people aged 15+ |
| 2004 panel, wave 2 | `2004/w2/p04putm2.zip` + `2004/p04putm2.sas`, `2004/w2/p04tm2d.txt` | Jun–Sep 2004 | 58,525 |
| 2008 panel, wave 2 | `2008/w2/p08putm2.zip` + `2008/p08putm2.sas`, `2008/w2/p08tm2d.txt` | Jan–Apr 2009 | 55,497 |
| 2021 annual file | `2021/pu2021_csv.zip` (panels 2018, 2020, 2021) | Feb–Jun 2021 | 33,135 |
| 2025 annual file | `2025/pu2025_csv.zip` (panels 2022–2025) | Feb–Jun 2025 | 18,833 |

All paths are under `https://www2.census.gov/programs-surveys/sipp/data/datasets/`.
`SHA256SUMS` covers the topical modules, their SAS layouts and dictionaries;
`downloads.json` records the URL, SHA-256, size and row counts of every annual file and
longitudinal-weight file (retrieved 2026-10-20). Census publishes no checksums, so the
files were checked against documented facts:

- Topical-module record counts: 72,707 (2001), 103,828 (2004) and 98,504 (2008) people.
  Their final person weights sum to 280.0, 288.2 and 300.4 million, the U.S. civilian
  non-institutional population in those years.
- The annual files' weights (each person's last month) sum to 331–342 million, the
  whole U.S. resident population that SIPP represents.
- Interview timing: the share of last marriages dated in the interview year is 1.6%
  (2001, mid-year interviews), 2.2% (2004) and 0.2% (2008 panel, interviewed January–April
  2009), as the documented interview calendars imply.
- Every ever-married record had a datable first marriage (no record dropped as undatable).

The 2021 and 2025 files hold disjoint panels, so the five surveys contain no person twice.
The 2022–2024 files repeat people from those panels and are used only for the prospective
links. The 2018–2020 files record only the first marriage's year (no separation or end
years), so they serve only the prospective model.

Terms: SIPP public-use files are released for statistical research; no attempt is made to
identify anyone. Person-level extracts stay out of git (`.gitignore`). Only code,
checksums, aggregate tables and fitted parameters are committed.

Citation: U.S. Census Bureau, *Survey of Income and Program Participation*, 2001, 2004 and
2008 panels (wave 2 topical modules) and 2018–2025 public-use files.

## 1. Retrospective first marriages

**Construction** (`build_retro.py`). For people married once, the marriage is the
"last/only" one (TLMYEAR/TLSYEAR/TLTYEAR in 2001–2008, TMAR1_YR/TSEP1_YR/TEND1_YR in 2021+)
and its outcome is the current marital status: married → censored at the interview;
widowed → censored at the end year; divorced or separated → event. For people married two
or more times, it is the "first" marriage and EWIDIV1 says whether it ended in widowhood
(censored) or divorce (event). An event is dated by the **separation year** when one is
recorded, else by the divorce year. The target is therefore dissolution (separation or
divorce), as in the NSFG lens.

**Timing.** Public files give years only. Weddings and separations are placed mid-year;
interviews at their documented point in the year (0.6 for 2001/2004, 0.2 for 2009, 0.33
for 2021/2025). A marriage is followed at most 30 years. Age at marriage is age at
interview minus years since the wedding (±1 year).

**Sample filters.** Weddings from 1960 onward (older marriages are seen only through
respondents who survived to be interviewed); age at marriage 15–60; end year not before the
wedding year. 206,877 → 176,303 marriages, 102,497 households, 2,694,990 marriage-year
intervals, 2.62 million person-years, 60,868 dissolutions, 8,331 widowhoods (censored).

**Inputs fixed at the wedding:** marriage length (the time axis), age at marriage, wedding
year, the respondent's sex, race-ethnicity (Hispanic, then non-Hispanic White, Black,
Asian, Other; 2001 codes Asian with Pacific Islander) and nativity.

**Education at the wedding** exists only in the 2001–2008 modules, which ask the year of
the high-school diploma (THSYR), of first college enrolment (TCOLLSTR) and of the bachelor's
degree (TBACHYR). Each person's level is set to what they had reached by the end of the
wedding year: Less than high school, High school, Some college, Bachelor or higher; a level
reached by the interview with no recorded year is Unknown (470 people). Education at the
interview is shown only descriptively: it can follow the wedding or the divorce.

**What is deliberately not used.** Spouse characteristics. The files describe only the
*current* spouse, who exists for intact marriages and is a different person after a
remarriage, so any spouse trait would encode the outcome. The prospective lens below is
where spouse traits belong.

**Models** (Poisson rates per marriage-year, survey weights normalised to mean 1 within
each survey, times exposure): constant rate; marriage length only (spline); additive spline
Poisson; Poisson tree (depth 4, ≥20,000 intervals per leaf); Poisson gradient boosting
(120 trees, depth 3). On the 2001–2008 subset, the additive model with and without
education at the wedding.

**Evaluation.** Five folds by household. Held-out Poisson deviance gain over a constant
rate; Harrell's C for dissolution within 10 years (risk = predicted 10-year probability);
deciles of predicted 10-year risk with the observed weighted Kaplan–Meier dissolution in
each (calibration and lift). 95% intervals: 200 household-bootstrap replicates (100 for C).

| Model | Deviance gain vs constant | Over duration-only | C (10 years) | Top-decile lift | Bottom decile |
| --- | --- | --- | --- | --- | --- |
| Marriage length only | 1.88% (1.80–1.98) | — | — | — | — |
| Additive spline Poisson | 4.07% (3.93–4.21) | 2.24% (2.15–2.33) | 0.651 (0.648–0.654) | 1.92× | 0.38× |
| Poisson tree, depth 4 | 3.20% (3.10–3.33) | 1.35% | 0.612 (0.609–0.616) | 1.47× | 0.56× |
| Gradient boosting | 4.82% (4.69–4.97) | 3.00% (2.91–3.10) | 0.653 (0.651–0.657) | 1.95× | 0.37× |
| 2001–2008 only: additive | 4.14% (3.97–4.31) | 2.31% | 0.653 | 1.93× | 0.38× |
| 2001–2008 only: + education at wedding | 4.41% (4.25–4.59) | 2.58% | 0.662 (0.659–0.665) | 1.95× | 0.38× |

Education at the wedding adds 0.28% deviance (95% CI 0.24–0.32) over the same model on the
same people. Observed/expected ratios are 0.999–1.000. `retro_heldout_calibration_10y.csv`
has every decile.

**Descriptive weighted Kaplan–Meier** (`retro_weighted_survival.csv`): 74.0% of first
marriages are intact (no separation) at 10 years and 61.3% at 20. At 10 years: married under
20, 59.1%; at 25–29, 82.9%; at 35+, 85.8%. Weddings of the 1970s, 70.8%; of the 2000s, 77.4%;
of the 2010s, 82.5%. Bachelor's degree by the wedding (2001–2008 modules) 86.2% versus
high school only 69.7%. Asian 88.2%, Hispanic 78.5%, White 73.3%, Black 67.4%. Foreign-born
82.3%, U.S.-born 72.3%. The five surveys agree within 4.5 points at 10 years even though
their cohort mixes differ.

**Population reference** (bundle `population_reference`, summary in
`retro_population_reference_summary.csv`): weighted percentiles p1–p99 of each person's
HELD-OUT predicted probability of dissolution by 5, 10 and 20 years, from their own inputs
(5-fold cross-fitting), in the standard shape `{horizons: [5, 10, 20], overall: {n, quantiles: {p1..p99: [5y, 10y, 20y]}}, subgroups: {variable: {level: {n, quantiles}}}}`: everyone plus 30 subgroups of sex, age at marriage, wedding decade, race-ethnicity, nativity, survey and (from the education model, 2001–2008 only) education at the wedding; each has ≥100 people and records n. The
median person's predicted 10-year risk is 24.1% (p10 14.1%, p90 40.0%); married under 20,
39.4%; married at 35+, 14.8%; bachelor's degree by the wedding, 16.4%.

**Limits.** Retrospective reports: recall error in years, and respondents who died, were
institutionalised or emigrated are missing. Weights are the cross-sectional weights of the
interview, not of the marriage cohort. Separation dates for people married three or more
times are not needed (only first marriages are modelled). Same-sex first marriages cannot be
told apart retrospectively. Associations, not causes.

## 2. Prospective couple model

**Linking.** Consecutive annual files share SSUID and PNUM within a panel. Baseline: in
file *t* (reference year *t*−1), an opposite-sex couple married and living together in
December (EMS_EHC = 1 with reciprocal spouse pointers EPNSPOUS_EHC), wife's row as the unit.
Outcome: in file *t*+1, the wife reports separated or divorced (EMS_EHC 4 or 5) in any month
of reference year *t*. Widowhood without separation is dropped. Weight: the wife's two-year
longitudinal weight FINYR2 from `lgtwgt{t+1}yr2` (`lgtwgt2019` for 2019), which Census
adjusts for attrition between the two interviews. Seven links: 2018→2019 through 2024→2025.

**Inputs (all measured in the baseline year):** both spouses' ages, years married (current
marriage; missing for remarried people in 2018–2020, which date only first marriages),
times married, education, the wife's race-ethnicity and whether the spouses share it, each
spouse's nativity; and, for the wealth model, each spouse's earnings, household income,
household net worth, total and unsecured debt (December), home ownership, months employed
and people under 18 in the household. Money is winsorised at the weighted 1st/99th
percentiles. Unlike the retrospective lens, spouse traits are valid here: they are observed
for every couple before the outcome window.

**Models:** constant; logistic with demographics and education (uniform-knot splines);
logistic adding the economic inputs; Poisson gradient boosting (80 trees, depth 2) on all
inputs. The logistic penalty is chosen by 3-fold household-grouped CV inside each training
fold. Five folds by household; 500 household-bootstrap replicates.

**Sample.** 33,698 couple-years from 17,960 couples in 17,621 households; 312 separations or
divorces; weighted one-year rate 11.1 per 1,000 (`prospective_sample_audit.json` lists each
link: couples at baseline, wives found next year, with a longitudinal weight, events).

| Model (held out by household) | Deviance gain vs constant | AUC | Top-decile lift |
| --- | --- | --- | --- |
| Demographics and education, both spouses | 5.77% (3.66–7.86) | 0.695 (0.661–0.726) | 2.76× |
| + earnings, income, net worth, debt, home ownership, employment, children | 5.03% (3.39–6.48) | 0.695 (0.661–0.725) | 2.53× |
| Gradient boosting, all inputs | 4.34% (2.98–5.59) | 0.681 (0.647–0.712) | 2.28× |

**Wealth adds nothing measurable once demographics are known:** −0.79% deviance (95% CI
−2.82 to +0.91) and +0.000 AUC (−0.028 to +0.026) over the demographics model on the same
couples. Descriptively the gradients are steep (`prospective_rates_by_baseline.csv`, weighted
per 1,000 couple-years): negative net worth 24.4, $0–49k 18.8, $50k–249k 11.8, $250k–999k 8.8,
$1M+ 4.9; renters 19.5 versus owners 8.9. But wealth tracks age, marriage length, education and
marriage order, which carry the same information here. With 312 events a modest independent
effect cannot be ruled out; the intervals above bound it.

**Limits.** 312 events is small: wide intervals, and no subgroup is reliable alone. Attrition
is related to divorce (a spouse who moves out may leave the sample); the longitudinal weights
correct only for what Census models. The wife's report defines the outcome. Same-sex and
unmarried couples are excluded.

## Files

- `download.sh`, `SHA256SUMS`, `downloads.json`: sources and checksums.
- `build_retro.py`, `extract_pu.py`, `train_retro.py`, `train_prospective.py`, `survival_utils.py`.
- `retro_*.csv|json|txt`, `prospective_*.csv|json`: aggregate results (no person-level rows).

Run: `sh download.sh WORK`, `python3 -I build_retro.py WORK/raw WORK/pu WORK/retro.parquet
2021 2025`, `python3 -I train_retro.py WORK`, `python3 -I train_prospective.py WORK`
(scikit-learn 1.7.2; about 1.5 GB of memory each).

## 2026-10-20 extension of the prospective couple model (`extract_ext.py`, `extended_predictors.py`)

`python3 -I extract_ext.py WORK/pu 2018 … 2025` re-reads the annual files (hashes in
`downloads_ext.json`) for each person's job-1 occupation and industry and the household's wealth
components in December; `python3 -I extended_predictors.py WORK` tests them on the same 33,698
couple-years (312 separations or divorces), household folds and in-fold penalty choice as
`train_prospective.py`, with a paired household bootstrap (1,000). All new inputs are measured in the
baseline December, before the outcome year:

- each spouse's occupation (TJB1_OCC, 2018 Census codes, major group; "No job" when job 1 is not
  reported, which includes retired spouses);
- the husband's race-ethnicity (the model had only the wife's and same/different). SIPP's public
  ERACE is White alone / Black alone / Asian alone / residual, so AIAN, NHPI and multiracial
  people are one "Other" group (`app/data/race_coverage.json`);
- home equity, bank accounts, stocks and mutual funds, retirement accounts and business equity
  (household; clipped to the weighted 1st–99th percentiles), beyond the net worth, debt and home
  ownership already in the model.

| Variant | Log-loss gain % (95% CI) | Minus current, points (95% CI) |
| --- | --- | --- |
| current (demographics + wealth) | 5.03 (3.42–6.50) | — |
| + each spouse's occupation | 5.14 (3.49–6.61) | +0.11 (−0.08 to +0.30) |
| + husband's race-ethnicity | 4.98 (3.38–6.43) | −0.05 (−0.14 to +0.04) |
| + wealth components | 4.68 (3.19–5.98) | −0.35 (−0.83 to +0.16) |
| + all | 4.66 (3.15–6.01) | −0.37 (−0.89 to +0.13) |

**Nothing adds held-out skill.** Adjusted odds ratios (near-unpenalised logistic with every current
input, 150 household-bootstrap refits; `extended_rate_ratios.csv`): $100,000 more in bank accounts
0.82 (0.60–1.00); home equity 0.97 (0.88–1.05) per $100,000; no occupation group of either spouse
differs clearly from management and professional jobs (wives with no job 1.52, 0.87–2.64). A
husband reported as Asian has 3.87 (1.35–9.77) times the odds given the wife's group and whether
they match — 18 events, so this is fragile. `models_extended` (all blocks) and its test vectors
are in `app/models/sipp_prospective_couples.json` for transparency.
