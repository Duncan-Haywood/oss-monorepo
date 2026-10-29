# Survey estimates and proxy tests: methods and results

Raphael's Map, survey layer. Written 2026-10-29 for a methodologist
reviewing what the page's Survey Explorer shows and why. Code:
`pipeline/survey_stats.py` (estimator), `pipeline/build_surveys.py`
(tables), `pipeline/proxy_tests.py` (held-out tests), preregistration
`pipeline/proxy_tests_prereg.md`, tests `pipeline/test_surveys.py`.
Outputs: `data/surveys/questions.json`, `crosstabs.json`, `proxy_tests.json`.

## 1. Summary

- The target subgroup the product is built around (never-married women
  18-29 who are Catholic and attend services weekly) has **n = 19, Kish
  n_eff = 13.0** in the GSS 2010-2018 and **n = 8, n_eff = 4.4** in 2021-2024
  among respondents asked the ideal-family-size item. Both are suppressed.
  No national survey ingested here can give a direct estimate for that
  group, let alone a regional one. Dropping "never married" (n_eff 18.5 and
  6.5) or widening to 20-29 (n_eff 12.0) does not rescue it.
- What survives, GSS 2010-2018 (in-person), share giving an ideal family
  size of four or more children, with 95% design-based intervals:

  | Women | n | n_eff | Ideal 4+ | "As many as you want" |
  |---|---|---|---|---|
  | 18-29, all | 708 | 431 | 14.9% (11.7-18.7) | 8.6% (6.4-11.5) |
  | 18-29, never married | 504 | 293 | 14.1% (10.6-18.5) | 8.6% (5.8-12.6) |
  | 18-29, Catholic (any attendance) | 154 | 95 | 15.9% (9.8-24.9) *exploratory* | 6.2% (2.8-13.1) |
  | 18-29, attend weekly+ (any religion) | 131 | 87 | 24.3% (15.6-35.8) *exploratory* | 4.1% (2.1-7.9) |
  | 18-29, weekly+ and never married | 74 | 47 | 27.4% (15.8-43.1) *exploratory* | 4.9% (2.1-10.8) |
  | 18-29, attend less than weekly | 575 | 344 | 12.8% (9.7-16.6) | 9.6% (7.0-13.0) |
  | 18+, Catholic, weekly+ | 236 | 160 | 18.9% (13.4-25.8) | 13.7% (9.5-19.3) |
  | 18+, Catholic, less than weekly | 731 | 474 | 11.5% (9.1-14.5) | 10.9% (8.1-14.4) |

  Catholic affiliation alone barely moves the 4+ share among young women
  (15.9% vs 14.9% for all women 18-29); weekly attendance roughly doubles
  it relative to less-than-weekly attenders (24.3% vs 12.8%), with wide,
  exploratory intervals.
- In the preregistered held-out tests (train 2000-2012, test 2014-2018),
  weekly attendance improved out-of-sample discrimination for "ideal 4+"
  (ΔAUC +0.024, Bonferroni interval 0.007 to 0.039) and, much more clearly,
  for "divorce should be more difficult to obtain" (ΔAUC +0.057), where it
  also beat Catholic affiliation (difference +0.061). Catholic affiliation
  passed for "ideal 4+" by a hair (ΔAUC +0.008). Weekly attendance did
  **not** beat affiliation by a margin that clears the multiplicity
  adjustment for "ideal 4+". Political identification, rural residence,
  intact family at 16 and hunting were **not supported**.
- The 2021 switch to push-to-web breaks the CHLDIDEL series: "as many as
  you want" goes from 9.7-11.9% of adults (weighted, 2006-2018) to
  22.5-29.1% (2021-2024).
  2010-2018 and 2021-2024 are reported separately, never pooled.
- No NSFG estimate is published: the public CSV has no value labels and the
  codebook was not fetched, so its codings are unconfirmed (section 7).

## 2. Data

**General Social Survey (GSS)**, NORC at the University of Chicago. The 13
yearly Stata files 2000-2024 (no 2020 fieldwork) were downloaded on a
GitHub runner (`pipeline/fetch.py`, branch `raphaels-map-raw`), reduced to
50 columns and stored as `gss/gss_2000plus_selected.csv.gz` with variable
and value labels from the Stata files (`gss_selected_labels.json`); SHA-256
in `raw/manifest.json`. 38,865 records; 37,583 after the weight rule below.
Universe: adults 18+ in U.S. households.

**National Survey of Family Growth (NSFG) 2022-2023**, Female Respondent
public-use file (NCHS/CDC), `NSFG_2022_2023_FemRespPUFData.csv` (5,586
women aged 15-49, 1,912 columns; file date 2024-10-28 in the zip). The male
file is not ingested.

Columns and coverage checked year by year before any pooling:

- `wtssall` is absent in 2021, 2022 and 2024; `wtssnrps` is absent in 2000
  and 2002; `wtssps` is present in every year.
- `fehome` does not exist in any of these files; it is not reported.
- `srcbelt` is absent in 2024, so urbanicity uses `xnorcsiz`.
- `divlaw`, `reliten`, `postlife`, `bible` were not asked in 2021.
- `region` in these files is the **4-region** code (Northeast, Midwest,
  South, West), not the 9 Census divisions. Division-level context is
  therefore not available from this extract.
- `hunt` is asked on two of three ballots in most years (all in 2021).

## 3. Weights and design

**Weight.** `wtssps`, the person post-stratification weight, the only weight
in every year. Cases with no `wtssps` are the 2022 and 2024 AmeriSpeak
black/Hispanic/AANHPI oversample frames (`sample` 12: 605 cases; 14: 677);
they are excluded rather than given an invented weight. Sensitivity: with
`wtssnrps` instead, the share of women 18-29 with ideal 4+ is 14.92% vs
14.86% (2010-2018) and 11.69% vs 11.72% (2021-2024).

**Pooling.** Within a period, each year keeps its own weights (each sums to
about its sample size), so years count in proportion to their sample size.
Periods: 2010-2018 (five in-person years) and 2021-2024 (2021 push-to-web;
2022 and 2024 multimode). Every 2021-2024 table carries the flag
`mode_mixed`.

**Design.** Strata = year × `vstrat`, PSU = `vpsu` within stratum. The
2010-2018 file has 2 PSUs per stratum; 2021 has 9 strata with `vpsu` close
to one per respondent (address-based sample), which the estimator handles
without change. NSFG: strata `VEST` (20), clusters `VECL` (4 per stratum),
weight `WGT2022_2023`.

**Variance.** Taylor linearisation of the domain ratio
p = Σ w·y / Σ w with the first-stage, with-replacement PSU approximation
(no finite-population correction, no later-stage terms), computed over
every PSU in the period file so that domain estimation is honoured (PSUs
with no domain members contribute zeros). Single-PSU strata are centred on
the grand mean of PSU totals (R survey's `lonely.psu = "adjust"`). Design
degrees of freedom = #PSU − #strata. Cross-check: for women 18-29,
2010-2018, the Taylor SE of the 4+ share is 0.0176 and an independent
stratified delete-one-PSU jackknife gives 0.0176. Design effects for the
headline cells are 1.4-1.9.

**Intervals.** 95%, logit-transformed with a t(df) critical value, so small
proportions get asymmetric intervals that stay inside (0, 100). Where a
cell is exactly 0% or 100% a Wilson interval at n_eff is used and the
table is flagged `ci_wilson_at_boundary` (this flag is per table: it fires
when any row hits a boundary, usually a 0% "None" row). A table without
design information would get Kish-adjusted binomial SEs and the flag
`approx_ci`; no published GSS or NSFG table needs it.

## 4. Reliability rules and missing data

- n_eff = (Σw)²/Σw² over valid answers in the domain. n_eff < 30: rows are
  null, `n`, `n_eff`, `weighted_base` and `excluded` are kept, flag
  `suppressed_small_sample` (the page shows "Insufficient sample").
  30 ≤ n_eff < 100: flag `exploratory_sample`. These are product
  guardrails (SPEC §6.2), not statistical laws: a 30-case cell can still
  have an interval 30 points wide.
- **Denominator**: valid substantive answers only. "As many as you want"
  (CHLDIDEL 8) is a valid answer and stays in the denominator as its own
  row.
- **Excluded counts**: the extract stores Stata extended missing values
  (`.d` don't know, `.n` no answer, `.r` refused, `.s` skipped on web, `.i`
  inapplicable) as blanks, so they cannot be told apart. The build recovers
  the structural part: a case on a (year, ballot) cell where nobody
  answered the item is counted as `iap` (not asked). Every other blank is
  `missing_unsplit` and `dk`/`refused` stay 0 for GSS tables, with the flag
  `missing_codes_collapsed`. For the headline cells unsplit missing is under
  1% of those asked (e.g. 6 of 714 women 18-29 asked CHLDIDEL in
  2010-2018). Within a split-form ballot (DIVLAW in 2002, 2004, 2022,
  2024, where about 40-50% of a ballot has an answer) the form-level IAP is
  also in `missing_unsplit`. Fix upstream: read the Stata files with
  `pyreadstat.read_dta(..., user_missing=True)` so the letter codes survive.
- Null is never zero: an unobserved cell is `null`; a real 0% is `0.0`.

## 5. Estimates and their caveats

Each table gives the filter (sex × age band 18-29 / 20-29 / 30-44 / 18+ ×
Catholic or any × weekly / less / any attendance × never married or any),
period and mode, n, n_eff, weighted base, excluded counts, per-row
percentage, 95% CI, SE and design effect. 1,256 tables: 941 with rows,
315 suppressed or unconfirmed.

**Ideal number of children (CHLDIDEL).** Rows 0, 1, 2, 3, 4+ (4-6 and
"7 or more"), "as many as you want". The raw file labels only codes 7 and 8;
0-6 are self-labelled counts. It is an ideal for "a family", not the
respondent's own intention, expected births or behaviour (those are NSFG
measures, section 7). Wording: only the variable label "Ideal number of
children" is in the files; `questions.json` says so instead of quoting a
question text from memory.

*Mode break.* Weighted share of adults answering "as many as you want":

| Year | 2006 | 2008 | 2010 | 2012 | 2014 | 2016 | 2018 | 2021 | 2022 | 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| "As many as you want" | 11.3 | 11.8 | 9.7 | 10.6 | 11.9 | 11.1 | 10.8 | 29.1 | 22.5 | 25.3 |
| 4+ (of all valid) | 9.7 | 10.3 | 11.0 | 10.5 | 10.1 | 13.4 | 11.9 | 8.1 | 11.2 | 9.3 |
| 4+ (of numeric answers) | 11.0 | 11.7 | 12.2 | 11.8 | 11.5 | 15.1 | 13.4 | 11.5 | 14.5 | 12.5 |

**[Post hoc, descriptive]** The jump is consistent with the web
instrument showing "as many as you want" as an explicit option where the
interviewer previously took it only if volunteered; the GSS documentation
should be checked before saying so as fact. Among respondents who gave a
number, the 4+ share is flat across the break (11-15%), so "4+ among
numeric answers" is the more mode-robust indicator; the share of all
valid answers is not. The page should show the two periods side by side,
never as a trend.

**Gender-role items (FEFAM, FEPRESCH, FECHLD, MEOVRWRK).** Role norms about
families in general, labelled as such, **not** a woman's preference for her
own life (SPEC §5.2). E.g. women 18-29, 2010-2018: 24.8% agree or strongly
agree that it is better for the man to work and the woman to tend the home
(4.5% + 20.3%); among weekly attenders 42.7% (exploratory, n_eff 87). The
spec's stronger measure (preference for one's own employment while raising
young children) is not in these files.

**Divorce law (DIVLAW).** Response options exactly as labelled: "easier",
"more difficult", "stay as is". It is an opinion about divorce law, never
a marital-permanence measure or a probability that a marriage lasts. Not
asked in 2021, so the later period is 2022-2024 (`years_missing_in_period`).
Women 18-29, 2010-2018: 34.3% "more difficult"; weekly attenders 54.8%
(exploratory). 2022-2024: 14.7% (exploratory, n_eff 81, mode mixed).

**Religious attendance by affiliation.** The "nominal vs practising"
distinction (SPEC §12) in numbers, 2010-2018: among Catholic women 18-29,
18.6% attend weekly or more (16.2% every week + 2.4% several times a week;
n_eff 148) and 17.2% never attend; among Catholic women 18+, 26.2% weekly+
(n_eff 986). 2021-2024: 17.2% of Catholic women 18-29 (exploratory) and
20.1% of Catholic women 18+. So roughly four in five young women who call
themselves Catholic in the GSS do not attend weekly; an all-age Catholic
adherent count is not a count of practising young women. Self-reported
attendance is generally higher than measured attendance in the survey
literature; these are self-reports.

**Region (4 regions, CHLDIDEL only).** For women 18-29 (all religions) the
four regions have n_eff 65-162 (Northeast and Midwest exploratory). For
Catholic women 18-29 only the Midwest clears n_eff 30 (30.7). For the target
subgroup every region has n ≤ 7 (n_eff ≤ 5.2) and for weekly-attending
Catholic women 18-44 n_eff ≤ 13.7: all suppressed. These tables are
published with null rows so the page can say "Insufficient sample" rather
than nothing. Regional differences should not be read from these numbers.

## 6. Proxy tests (SPEC §6.3)

**Preregistration.** `pipeline/proxy_tests_prereg.md` fixed the outcomes,
predictors, controls, splits, metrics and decision rule before any model
was fitted. It is same-session preregistration: it constrains the analyst
but nobody outside the session witnessed the order; the file's commit is
the only external evidence. What had been seen before writing it is listed
there (marginals by year only).

**Design.** Adults 18-44; weighted logistic regression (`wtssps`); baseline =
age, age², sex, degree (5), region (4); each proxy added to the baseline,
both fitted and scored on identical complete-case rows. Split A
(confirmatory): train 2000-2012, test 2014-2018, all in-person. Split B
(exploratory): train 2000-2018, test 2021-2024. Test metrics weighted:
AUC (weighted Mann-Whitney), Brier, calibration in the large and slope.
Uncertainty: 1,000-replicate PSU-within-stratum bootstrap of the test set,
model held fixed. This captures test-sample variation but **not** training
uncertainty; intervals for ΔAUC are therefore narrower than a full
train-and-test resampling would give. Decision rule: "supported out of
sample" iff the Bonferroni-adjusted interval for ΔAUC excludes 0 (99.29%
for the seven Y1 tests, 97.5% for the two Y2 tests) and ΔBrier ≤ 0;
"insufficient data" if the test set has < 300 cases or < 30 positives.

**Confirmatory results (Split A).**

| Test | Outcome | Proxy | n train / test (pos.) | Baseline AUC | Model AUC (95%) | ΔAUC (95%) | ΔAUC adj. interval | Brier base → model | Train OR | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| H1 | ideal 4+ | weekly attendance | 4181 / 1873 (265) | 0.646 | 0.669 (0.637-0.698) | +0.024 (0.012, 0.034) | (0.007, 0.039) | 0.11191 → 0.11146 | 1.35 (1.01-1.80) | supported out of sample |
| H2 | ideal 4+ | Catholic | 4192 / 1864 (265) | 0.647 | 0.656 (0.624-0.685) | +0.008 (0.002, 0.014) | (0.001, 0.016) | 0.11287 → 0.11254 | 1.15 (0.88-1.49) | supported out of sample |
| H3 | ideal 4+ | weekly vs Catholic | 4172 / 1863 (264) | | | difference +0.014 (0.002, 0.026) | (−0.001, 0.031) | | | not supported |
| H4 | ideal 4+ | Republican + conservative | 4027 / 1803 (246) | 0.652 | 0.654 | +0.002 (−0.007, 0.011) | (−0.011, 0.014) | 0.10968 → 0.10969 | 1.17, 1.13 | not supported |
| H5 | ideal 4+ | rural/small place | 4205 / 1879 (266) | 0.647 | 0.648 | +0.001 (−0.000, 0.002) | (−0.001, 0.002) | 0.11213 → 0.11210 | 0.95 | not supported |
| H6 | ideal 4+ | intact family at 16 | 4205 / 1879 (266) | 0.647 | 0.652 | +0.005 (0.001, 0.009) | (−0.001, 0.010) | 0.11213 → 0.11198 | 1.09 | not supported |
| H7 | ideal 4+ | hunts | 2075 / 923 (128) | 0.645 | 0.633 | −0.011 (−0.029, 0.005) | (−0.036, 0.010) | 0.11596 → 0.11587 | 0.62 (0.37-1.03) | not supported |
| H8 | divorce harder | weekly attendance | 4466 / 2042 (720) | 0.563 | 0.619 (0.597-0.642) | +0.057 (0.042, 0.071) | (0.040, 0.072) | 0.23469 → 0.22474 | 2.10 (1.75-2.52) | supported out of sample |
| H9 | divorce harder | weekly vs Catholic | 4455 / 2033 (715) | | | difference +0.061 (0.047, 0.077) | (0.045, 0.078) | | | supported out of sample |

Odds ratios are from the training fit with PSU-cluster-robust SEs
(stratification ignored, so slightly conservative).

**Reading them.**

- *Attendance vs affiliation (SPEC's first hypothesis).* For the
  divorce-law item the answer is clear: weekly attendance carries the
  information (ΔAUC +0.058) and Catholic affiliation adds nothing
  (ΔAUC −0.003). For ideal 4+, attendance's gain is about three times
  affiliation's (+0.023 vs +0.009 on common rows) and the unadjusted 95%
  interval of the difference excludes 0, but the preregistered
  Bonferroni interval does not, so H3 is recorded as **not supported**.
  H2's "supported" is a statistically detectable but practically negligible
  gain: 0.008 of AUC, with a training odds ratio whose interval includes 1.
- *Magnitude.* Even the supported proxies move AUC from about 0.65 to 0.67
  (ideal 4+) or 0.56 to 0.62 (divorce law). They are weak individual-level
  signals, not ways to identify individuals.
- *Calibration.* Models trained on 2000-2012 under-predict ideal 4+ in
  2014-2018 (mean predicted 0.116 vs observed 0.134) and over-predict
  "divorce harder" (0.443 vs 0.340): real temporal drift in the outcomes.
  Slopes are near 1 in Split A (1.05-1.23).
- *Political, rural, family of origin, hunting* add nothing for ideal 4+
  after the demographic baseline. The hunting test has the least power
  (asked on two ballots; 128 test positives).

**Exploratory results (no confirmatory verdict).**

- Split B (to 2021-2024): weekly attendance ΔAUC +0.015 (−0.001, 0.029);
  Catholic +0.002; political identification +0.028 (0.013, 0.043), the one
  proxy that gains across the mode break; calibration slopes fall to
  0.4-0.7 for every model, so models trained on in-person years transport
  poorly to the new mode whatever the proxy.
- S1 (counting "as many as you want" as 4+): weekly +0.020 (0.008, 0.032),
  Catholic −0.000.
- Divorce law: political identification +0.066 (0.047, 0.086), larger than
  weekly attendance's +0.057; rural, family of origin, hunting near 0.
- Male-earner role norm (FEFAM agree): weekly +0.027, political +0.015,
  hunting +0.011, Catholic 0.000.
- Women 18-34 only (657 test cases, 114 positives): weekly +0.003
  (−0.000, 0.007), Catholic +0.001. In the subgroup the product cares
  about, neither proxy shows a detectable gain; the sample is small.

**Scope.** These are individual-level associations inside one survey. They
say nothing about county vote shares, county hunting-licence rates or
county Catholic adherents as predictors of anything: those ecological
proxies remain `unvalidated_hypothesis` in the product and must never be
read as an individual's probability.

## 7. NSFG: why nothing is published yet

The NSFG public CSV carries no value labels, and the codebook PDF
(linked from the documentation page in raw/, `2022-2023-NSFG-FemRespPUFCodebook.pdf`)
was not downloaded. Only `AGE_R` is confirmed, by the readme in the zip
("R's age at interview AGE_R with values 15-49"). For `ADDEXP` (candidate:
expected additional births × 10), `INTENT` (candidate: intends more
children), `RELIGION`, `ATTNDNOW` and `FMARITAL` the codings in
`pipeline/registry/nsfg_codings.json` are candidates only, so the build
publishes their tables with `n` and `n_eff` for the age universe and null
rows, flag `coding_unconfirmed` (plus `expected_not_ideal` /
`intended_not_ideal`). Structural evidence, recorded in
`questions.json` diagnostics, supports the candidates without confirming
them: FMARITAL = 5 coincides case for case with EVRMARRY = 0 (3,024); every
INTENT = 2 case has ADDEXP = 0; ADDEXP takes only multiples of 5 (0-110),
with half-values concentrated in INTENT = 3; INTENT has a fourth code (17
cases) with no candidate meaning. Once the codebook is fetched, setting
`confirmed_from` per variable makes the build publish design-based
estimates (women 18-29, 20-29, 30-44, 18-49; Catholic and never-married
filters once RELIGION and FMARITAL are confirmed). The universe is women
15-49; nothing above 49 exists in the file.

These would be **expected / intended** births, a different measure from
GSS ideal family size; the page must not place them on one scale.

## 8. Limitations

1. **Sparse target.** The product's target subgroup is too small in every
   national survey ingested here. Honest partial views (broader groups,
   flagged) are all that the data support (SPEC §12).
2. **Mode change.** 2021-2024 is not comparable with 2010-2018 for
   CHLDIDEL and probably for other items; mode effects for the attitude
   items were not separately tested.
3. **Nominal vs practising.** Affiliation and self-reported attendance are
   different measures; attendance is self-reported and likely overstated.
4. **Ideal vs expected.** GSS gives ideals; NSFG would give expectations
   and intentions; neither gives behaviour for unmarried women.
5. **Missing codes collapsed** (section 4); IAP recovered only at ballot
   level.
6. **Variance approximations.** With-replacement first stage; the proxy
   bootstrap ignores training uncertainty; odds-ratio SEs ignore
   stratification.
7. **Wording.** Only short variable labels are in the files; exact question
   text should be added from the GSS codebook and checked against each
   year's questionnaire.
8. **Geography.** National survey, 4 regions only; nothing here supports a
   county, metro or state estimate.

## 9. Reproduce

```
git fetch --depth=1 origin raphaels-map-raw
git archive origin/raphaels-map-raw | tar x -C /tmp/rm-raw
python3 -I ventures/raphaels-map/pipeline/build_surveys.py --raw /tmp/rm-raw --out ventures/raphaels-map/data
python3 -I ventures/raphaels-map/pipeline/proxy_tests.py  --raw /tmp/rm-raw --out ventures/raphaels-map/data
python3 -m pytest -q ventures/raphaels-map/pipeline/test_surveys.py
```

Deterministic: bootstrap seed 20261029; a rerun reproduces the JSON byte
for byte. Additions to the ARCHITECTURE.md contract (all optional extra
keys): table `period`, `mode`, `design_df`, `region_name`,
`filters.region`, row `se` and `deff`, `excluded.missing_unsplit`; flags
`mode_mixed`, `missing_codes_collapsed`, `years_missing_in_period`,
`coding_unconfirmed`, `expected_not_ideal`, `intended_not_ideal`,
`approx_ci`, `ci_wilson_at_boundary`; proxy verdict
"exploratory (no confirmatory verdict)" and fields such as `delta_auc`,
`delta_auc_ci95`, `delta_auc_ci_adjusted`, `calibration`, `confirmatory`.
