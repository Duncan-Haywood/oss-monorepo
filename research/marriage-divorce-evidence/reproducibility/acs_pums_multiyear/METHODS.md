# ACS multi-year PUMS: one-year divorce incidence baselines and models

How common is a divorce within one year among married Americans, overall and for people
like you? This folder answers that with 17 years of the American Community Survey's public
microdata (2008–2024; 53.6 million person records, of which 24.3 million were married in the year before
their interview). It produces:

- `app/data/acs_divorce_baselines.json`: weighted one-year divorce incidence per 1,000 with
  replicate-weight 95% CIs, by year, and for 12,760 subgroup cells (pooled 2019 and
  2021–2024, ≥200 unweighted people each). It also holds percentiles of model-predicted risk
  for comparing one person to the population.
- `app/models/acs_one_year_divorce.json`: six classical models of the same outcome, with
  held-out skill, intervals and test vectors (`app/tests/acs.test.mjs` checks the browser
  engine against scikit-learn to 1e-9).

**This is cross-sectional.** Everyone is interviewed once, after any divorce. It describes how
often people with given characteristics *report* a divorce in the past year. It is not a
forecast for an intact marriage, and characteristics that can follow a divorce (income,
employment, occupation, state of residence, sometimes education) are not causes.

## Source and verification

- Data: U.S. Census Bureau, American Community Survey 1-year Public Use Microdata Sample,
  national person files `https://www2.census.gov/programs-surveys/acs/data/pums/{YEAR}/1-Year/csv_pus.zip`
  for 2008–2019 and 2021–2024. 2020 was released only as experimental estimates,
  `https://www2.census.gov/programs-surveys/acs/experimental/2020/data/pums/1-Year/csv_pus.zip`.
  Retrieved 2026-10-20.
- `downloads.json` records each archive's URL, SHA-256, size, member files, person records
  and records kept. Census publishes no checksums. The 2023 archive's SHA-256 equals the one
  recorded independently in `../acs/manifest.json` (`98b6ecb1…`).
- Person records per year run 3.00 million (2008) to 3.42 million (2024), with 2.64 million
  in 2020, in line with the PUMS samples' documented size (about 1% of the population).
  Weighted, the at-risk population is 129.9 million (2008) to 142.2 million (2024) people
  aged 15+ who were married at some point in the year.
- 2024 renames the state column `ST` to `STATE`. Replicate weights are lower-case in older
  files. `extract.py` maps both.
- Terms: ACS PUMS are public-use files; no attempt is made to identify anyone. Person-level
  extracts stay out of git. Only code, checksums and aggregates are committed.
- Citation: U.S. Census Bureau, American Community Survey Public Use Microdata Sample,
  1-year files 2008–2024.

## Population, outcome and inputs

- **At risk:** aged 15+ and married at some point in the 12 months before the interview.
  That means now married (MAR 1) or separated (MAR 4), or divorced (MARHD 1) or widowed
  (MARHW 1) within those months. This matches the denominator of the published "refined"
  divorce rate.
- **Event:** MARHD = 1, divorced in the past 12 months.
- **Duration:** survey year minus MARHYP (year last married). People who divorced *and*
  remarried within the 12 months (MARHD = MARHM = 1, now married) have MARHYP dating the new
  marriage, so their duration is unknown. They count in the overall rate, but are left out of
  duration cells and of the models (they are events by construction).
- **Inputs** (derive.py): age; sex; years since the wedding; times married (MARHT); education
  (SCHL, 6 levels); race-ethnicity (Hispanic, then non-Hispanic White, Black, Asian, Other);
  nativity; state; personal income as a weighted percentile within the survey year (PINCP ×
  ADJINC, so pooled years need no price index); employment (ESR); broad 2018 Census
  occupation group (OCCP, 2019 onward).

## Baselines

All estimates use PWGTP. Standard errors come from the 80 successive-difference replicate
weights: variance = 4/80 Σ (rᵢ − r₀)², with a 95% CI of ±1.96 SE (truncated at 0). Subgroup
cells pool 2019 and 2021–2024. Each year's weights are divided by 5, and replicate *i* of the
pool is the sum of replicate *i* across years (Census guidance for combining ACS years);
2020 is excluded (experimental weights). Each cell needs ≥200 unweighted people. The cells
are every one-way and two-way cross of sex, age band, education, race-ethnicity, nativity,
duration band, times married, state, income quintile, employment and occupation group. Finer
cells cross state × age band × education × duration band × times married (6,463 cells),
age × education × duration × times married (667), and sex × age × education × duration (518).
Tables: `year_series.csv`, `baselines_oneway.csv`, `baselines_twoway.csv`, `baselines_fine.csv.gz`.

**By year** (per 1,000 married in the year, 95% CI): 2008 19.3 (18.9–19.6), 2010 18.2,
2012 18.6, 2014 16.4, 2016 15.9, 2018 14.8, 2019 14.5 (14.3–14.8), 2021 13.2, 2022 13.5,
2023 13.5, 2024 13.2 (13.0–13.5). The rate fell by about a third in 16 years. The 2020
experimental file gives 13.2 with an implausibly narrow replicate SE (0.04) and is shown
flagged, not pooled.

**Pooled 2019 and 2021–2024:** 7,569,524 people, 89,289 divorces, **13.6 per 1,000
(13.5–13.7)**; women 14.4, men 12.8.

| Group | per 1,000 (95% CI) | Group | per 1,000 (95% CI) |
| --- | --- | --- | --- |
| Age 15–24 | 21.0 (19.9–22.1) | Married once | 12.1 (11.9–12.2) |
| Age 35–39 | 18.7 (18.2–19.1) | Married twice | 17.7 (17.4–18.0) |
| Age 55–64 | 11.2 (10.9–11.5) | Married 3+ times | 23.6 (23.0–24.2) |
| Age 65+ | 5.7 (5.6–5.8) | 0–2 years since wedding | 13.7 (13.2–14.2) |
| Bachelor's | 11.1 (10.9–11.4) | 3–5 years | 20.0 (19.5–20.4) |
| Graduate/professional | 10.1 (9.8–10.3) | 6–10 years | 20.8 (20.4–21.2) |
| Some college | 16.4 (16.1–16.7) | 31+ years | 5.4 (5.2–5.5) |
| High school/GED | 15.3 (15.0–15.5) | Asian | 8.3 (8.0–8.6) |
| Unemployed* | 26.4 (25.1–27.6) | Black | 23.6 (23.0–24.2) |
| Income Q5 (top)* | 10.8 (10.6–11.1) | Foreign-born | 11.7 (11.5–12.0) |

\*Measured after the event. States range from New Jersey (10.7) to Arkansas (18.9). Divorce
peaks 3–10 years after the wedding: among 25–29-year-olds, 9.3 per 1,000 in years 0–2 and
30.1 in years 6–10.

## Models

Held out by **household**: a seeded random 10% of households in each pooled year form the test
set (756,818 people, 396,262 households, 8,528 divorces). Training is a random 800,975 rows
from the other 90% (9,166 divorces; a sample, to fit in memory). Weights are normalised to
mean 1 within each year. Metrics: weighted Bernoulli deviance gain over a constant rate, weighted AUC,
top-decile lift, decile calibration. 95% intervals come from 200 household-bootstrap replicates
(100 for AUC).

| Model | Inputs | Deviance gain | AUC | Top-decile lift |
| --- | --- | --- | --- | --- |
| Additive logistic (splines in age, duration) | background | 3.31% (3.07–3.68) | 0.666 (0.660–0.673) | 2.18× |
| Additive Poisson, log link | background | 3.31% (3.07–3.68) | 0.666 (0.660–0.673) | 2.18× |
| Poisson tree, depth 5 | background | 2.81% (2.60–3.07) | 0.646 (0.639–0.653) | 1.66× |
| Poisson gradient boosting (200 trees, depth 4) | background | 3.94% (3.63–4.28) | 0.680 (0.674–0.687) | 2.31× |
| Additive logistic | + income, employment, occupation* | 3.82% (3.55–4.22) | 0.678 (0.672–0.686) | 2.42× |
| Gradient boosting | + income, employment, occupation* | 4.91% (4.63–5.27) | 0.700 (0.695–0.706) | 2.55× |

"Background" inputs are age, sex, years since the wedding, times married, education,
race-ethnicity, nativity and state. \*Inputs measured after the event. They add 0.53%
(0.40–0.64) over the background logistic model, part of which is reverse causation. Observed/expected ratios
are 0.992–0.994. Calibration holds across the range: for boosting, 1.6 observed vs 1.8 predicted
per 1,000 in the lowest decile, and 30.5 vs 32.6 in the highest.

**Population reference** (`population_reference` in the bundle and `model_predicted_risk` in
the baselines JSON, same standard shape: `{horizons: [1], overall: {n, quantiles: {p1..p99: [value]}},
subgroups: {variable: {level: {n, quantiles}}}}`). These are weighted percentiles of the held-out
background boosting model's predicted one-year probability. Overall: p10 3.1, median 11.9, p90 25.0 per 1,000.
Subgroups: sex, age band, education, duration band, times married, race-ethnicity and nativity
(≥200 people each).

## Detail baselines: race and origin, occupation, industry, income and home ownership (2026-10-20)

`extract_detail.py` re-reads the pooled years' person archives for detailed race (RAC2P, RAC3P),
industry (INDP) and SOC occupation (SOCP), and the matching **housing** archives (`csv_hus.zip`) for
tenure (TEN), household income (HINCP × ADJINC, converted to 2024 dollars with CPI-U) and household
size; hashes are in `downloads_detail.json`. `detail_tables.py` joins them by SERIALNO + SPORDER
(every person matched) and tabulates the same outcome with the same replicate-weight CIs and ≥ 200
people per cell, plus a **direct age-standardised** rate (five age bands, standard = the pooled
at-risk population, computed in every replicate), because these groups differ a lot in age. Labels
come from the Census PUMS data dictionaries of each year. Output: `baselines_detail.csv.gz`, new
cells in `app/data/acs_divorce_baselines.json` (`race_detail`, `asian_detail`, `hispanic_origin`,
`household_income_band`, `tenure`, `owner`, and their crosses with sex, age band, education,
nativity, times married and duration), an `age_standardised` block, and
`app/data/acs_occupation_divorce.json` (detailed Census occupation code, SOC major group, broad
group, industry sector and detailed industry, each with sex crosses).

| Group (per 1,000, 95% CI; age-standardised) | | Group | |
| --- | --- | --- | --- |
| White (non-Hispanic) | 12.3 (12.1–12.4); 12.9 | Mexican | 13.7 (13.3–14.2); 12.6 |
| Black | 23.6 (23.0–24.2); 23.3 | Puerto Rican | 20.3 (18.9–21.7); 19.5 |
| Hispanic (any race) | 15.3 (15.0–15.6); 14.3 | Cuban | 15.5 (14.3–16.8); 15.3 |
| Asian | 8.3 (8.0–8.6); 8.1 | Dominican | 23.1 (20.8–25.4); 22.0 |
| American Indian or Alaska Native | 19.5 (17.8–21.2); 18.9 | Asian Indian | 5.2 (4.7–5.8); 4.9 |
| Native Hawaiian or Pacific Islander | 12.1 (9.6–14.7); 11.9 | Chinese | 8.3 (7.6–8.9); 8.2 |
| Multiracial | 18.9 (18.0–19.8); 17.4 | Filipino | 8.9 (8.2–9.7); 9.0 |
| Some other race | 16.7 (14.6–18.9); 15.1 | Vietnamese | 14.4 (13.1–15.6); 14.5 |

Asian subgroups with ≥ 200 people: Asian Indian, Bangladeshi, Burmese, Cambodian, Chinese,
Filipino, Hmong, Indonesian, Japanese (7.5), Korean (8.4), Laotian, Nepalese, Pakistani (6.4), Sri
Lankan, Taiwanese, Thai, Vietnamese and other Asian; several small ones have very wide intervals
(Sri Lankan: 7 divorces).

**Occupation, income and housing are measured at the interview, after any divorce**: a divorce can
change a job, a household's income and whether it owns its home, so these are descriptive rates of
who reports a divorce, not effects and not forecasts. By SOC major group: healthcare support 25.8
(age-standardised 23.7), military 25.8 (21.3), food preparation and serving 21.5 (18.6),
transportation and material moving 18.9 (18.0), against architecture and engineering 10.3 (9.5),
computer and mathematical 12.0 (10.6), legal 12.0 (11.5) and education 12.4 (11.4). Household
income under $25k: 31.7; $200k or more: 6.3 (the household is the one the person lives in after any
divorce). Renters 29.6 against owners with a mortgage 9.7 and owners free and clear 8.4 (12.3
age-standardised).

## Limits

Cross-sectional, as above. Each spouse of a divorcing couple can be counted, and same-sex and
opposite-sex marriages are pooled. Allocation (imputation) is kept as released; FMARHDP/FMARHYP/FMARHTP are in the
extracts for sensitivity work. Pointwise CIs are not adjusted for the many cells. Duration is years
since the *last* wedding, so for remarried people it is the current marriage. Occupation codes
changed in 2018, so occupation is used only from 2019.

## Files and running

`download.sh WORK` (wraps `extract.py`, about 3 minutes and 150 MB of extract per year),
`python3 -I baselines.py WORK`, `python3 -I train_models.py WORK` (scikit-learn 1.7.2; about 3 GB
of memory). `derive.py` holds every definition.
