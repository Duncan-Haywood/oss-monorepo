# HCMST couples: who breaks up within eight years, from one partner's report

This lens adds what the NLSY79 and NSFG lenses lack: **unmarried couples, same-sex couples
and a direct relationship-quality question**. It follows 3,009 U.S. adults who had a spouse
or main partner in early 2009 and records whether the couple broke up by 2010, 2011, 2013,
2014–15 and 2017. It also checks the 2009-trained models on the independent HCMST 2017
cohort (break-ups by 2020 and 2022).

## Source and verification

- **Data:** *How Couples Meet and Stay Together* (HCMST), Stanford University, PI Michael J.
  Rosenfeld. From `https://data.stanford.edu/hcmst` (Stanford Libraries, files on
  `stacks.stanford.edu`, druid `ns183dp7831`): public version 3.04 (waves 1–3, Stata), wave 4
  supplement 1.02, wave 5 supplement 1.0, wave 6 supplement 1.0, the brief user guide v5, the
  weights notes and the codebook. From `https://data.stanford.edu/hcmst2017` (druid
  `hg921sg6829`): *HCMST 2017 to 2022 small public version 2.2* (Stata), its codebook and the
  user's guide v2.3. Downloaded 2026-10-20; `SHA256SUMS` lists every file, including the
  `.dta` files inside the zips. Stanford publishes no checksums.
- **Counts checked against Stanford's documentation** (asserted in `train_models.py` and
  `test_app.py`): 4,002 respondents and 3,009 partnered (`qflag`), and 2,520, 1,960, 1,536 and
  1,127 completes in waves 2–5 (user guide v5). The 2017 file has 3,510 respondents, 2,862
  partnered, 2,107 interviewed in 2020 and 1,722 in 2022 (data.stanford.edu/hcmst2017). The 527
  break-ups used here equal HCMST's own `w2345_combo_breakup` (503) plus the 24 wave-6 break-ups
  in `w6_broke_up`.
- **Terms:** the data.stanford.edu data use agreement says the data must not be used to identify
  anyone, no fee may be charged if they are passed on, the PI should be told about work that
  uses them (mrosenfe@stanford.edu), and the data must be cited. Redistribution is not clearly
  granted, so git holds only scripts, checksums, aggregate tables and fitted parameters. `raw/`
  is ignored. **Owner action:** tell the PI about this use, as the agreement asks.
- **Citation:** Rosenfeld, Michael J., Reuben J. Thomas, and Maja Falcon. 2018. *How Couples
  Meet and Stay Together, Waves 1, 2, and 3: Public version 3.04, plus wave 4 supplement version
  1.02 and wave 5 supplement version 1.0 and wave 6 supplement ver 1.0.* Stanford University
  Libraries. Rosenfeld, Michael J., Reuben J. Thomas, and Sonia Hausen. 2023. *How Couples Meet
  and Stay Together 2017-2020-2022 combined dataset.* Stanford University Libraries.
- **Download note:** `stacks.stanford.edu` chains to *emSign Root CA - G1*, which is in
  Mozilla's root store but was missing from the cloud session's CA bundle. `download.sh`
  explains how to pass a bundle that has it. TLS verification was never turned off.

## Sample, timing and outcome

- **Couples:** the 3,009 partnered wave-1 respondents (Feb–Apr 2009): 1,928 married and 1,081
  unmarried (cohabiting or not); 2,535 different-sex couples, 242 male and 232 female same-sex
  couples (same-sex couples are oversampled). One respondent per couple, who reports for both
  partners.
- **Follow-up periods** run between the cohort's median interview months: 2009-02 → 2010-03 →
  2011-04 → 2013-03 → 2014-12 → 2017-07. These are periods 1–5, ending 1.1, 2.2, 4.1, 5.8 and
  8.4 years after wave 1.
- **Event:** HCMST's derived `w{2..6}_broke_up` = 1, meaning divorce or separation for married
  couples, or a break-up for unmarried couples. A partner's death (`= 2`, 98 couples) censors
  the couple at its last report of being together. When a break-up is reported after a skipped
  wave (60 break-ups), the reported year and month (waves 3–6) place it in a period. All 60
  have a date. The 257 undated break-ups were all reported at the first wave after the couple's
  last report of being together, so their period is unambiguous: the one that ends at the
  reporting wave. Couples count as together through every wave they
  report being together.
- **Rows:** 8,046 couple-periods from the 2,625 couples re-interviewed at least once. The 384
  never re-interviewed contribute no rows. Break-ups by period: 264, 108, 94, 40 and 21. By
  reporting wave: 248, 112, 95, 48 and 24.
- **Inputs** are wave-1 answers and prior KnowledgePanel profiles, all measured before any
  follow-up. Two are **time-varying in a known way**: `relationship_years` and `mean_age` are
  the values at the start of each period (wave-1 value + `time_offsets`).

| Input | From (2009 file) | Note |
| --- | --- | --- |
| `relationship_quality` | `relationship_quality` (Q34) | Excellent / Good / Fair / Poor or very poor (62 couples; "very poor" alone has 20) |
| `married`, `cohabiting` | `married`, `coresident` | |
| `couple_type` | `same_sex_couple`, `ppgender` | |
| `couple_race` | `respondent_race`, `partner_race` | both the same of White / Black / Hispanic / Other, or interracial |
| `party_pair` | `pppartyid3`, `q12` | |
| `how_met` | `either_internet_adjusted`, `met_through_*`, `q24_*` | first match: online, friends, family, work, school or college, bar, church, other |
| `prior_marriage` | `q17a` (married), `q17b` (unmarried) | the respondent only |
| `earnings` | `q23` | about equal versus one earned more |
| `religion_pair` | `papreligion`, `q7b` | current religion, 13 categories |
| `parental_approval` | `q30` | not asked when no parent is alive |
| `mean_age`, `age_gap` | `ppage`, `q9` | |
| `edu_years_mean`, `edu_gap` | `ppeduc`, `q10` | years, as HCMST's `respondent_yrsed` recode |
| `hh_income_k` | `hhinc` | HCMST's dollar value of the income band (top code 175k+ → 200) |
| `children_in_hh` | `children_in_hh` | under 18 |

Missing answers are an `Unknown` category (at most 69 couples per input, for `how_met`) or are
imputed with the median (≤ 27 per numeric input). **Not available:** religious attendance in
wave 1. The retrospective 2009 attendance item was collected in 2011–13, after some break-ups,
so it is excluded. The second partner's own answers, prior marriages and income are also
unavailable.

## Weights

The HCMST weights notes say same-sex couples get very small `weight2` values because of the
oversample, and recommend unweighted regression that includes the predictors of the weights
(Winship & Radbill). **The models are fitted unweighted.** `couple_type`, age, race and
education are inputs. Held-out scores are given unweighted, with survey-weighted (`weight2`)
point estimates as a sensitivity. Descriptive rates are given both ways.

## Models and evaluation

All models are logistic discrete-time hazards: P(break-up in period k | together at its start).

| key | model |
| --- | --- |
| `period_only` | period dummies only (baseline curve) |
| `quality_only` | period + relationship quality |
| `additive_core` | period + 7 numeric inputs as quadratic splines (4 quantile knots) + 9 categorical inputs; L2, C = 0.3 |
| `additive_full` | as core, plus `religion_pair` and `parental_approval` |
| `tree_depth3` | regression tree on the period rows (depth 3, ≥ 300 rows per leaf); the leaf value is a probability |
| `boosting` | HistGradientBoosting (depth 3, 150 iterations), comparison only |

- **Validation:** 5 repeats × 5-fold `GroupKFold` by couple (shuffled). All of a couple's
  periods sit in one fold. Each score is computed on out-of-fold predictions and averaged over
  repeats. **95% intervals** come from 1,000 couple-bootstrap resamples of the held-out
  predictions. The L2 strength C was chosen once by grouped 5-fold CV on all couples from
  {0.03, 0.1, 0.3, 1}. That choice is not nested, which adds slight optimism. C = 0.3 for both
  additive models.
- **Scores:** log-loss gain against a constant per-period probability and against
  `period_only`; per-period AUC; Harrell's **C-index** of predicted 8.4-year risk against
  break-up time (a couple is comparable when it survived the event's period); couple-level AUC
  for break-up by April 2011 (~2.2 years); Brier score; observed/expected; calibration slope;
  decile lift.

### Held-out results (all couples; `heldout_model_comparison.csv`)

| Model | Log-loss gain vs period-only | C-index | AUC break-up by 2011 | Per-period AUC | Brier | O/E |
| --- | --- | --- | --- | --- | --- | --- |
| Period only | — | 0.49 (0.48–0.50) | 0.48 | 0.60 (0.58–0.62) | 0.0613 | 1.00 |
| Relationship quality only | 6.2% (4.7–7.8) | 0.68 (0.65–0.70) | 0.67 (0.65–0.71) | 0.71 (0.68–0.73) | 0.0588 | 1.00 |
| **Additive, core** | **25.5% (22.6–28.3)** | **0.878 (0.864–0.892)** | **0.902 (0.887–0.917)** | 0.872 (0.856–0.888) | 0.0503 | 0.98 |
| Additive, all inputs | 25.4% (22.5–28.2) | 0.878 (0.864–0.892) | 0.902 (0.887–0.916) | 0.871 (0.856–0.887) | 0.0504 | 0.98 |
| Tree, depth 3 | 19.9% (17.1–22.6) | 0.844 (0.828–0.860) | 0.870 (0.852–0.887) | 0.831 (0.813–0.848) | 0.0530 | 1.00 |
| Boosting (not exported) | 26.3% (23.6–29.0) | 0.882 (0.868–0.894) | 0.907 (0.893–0.920) | 0.876 (0.861–0.890) | 0.0501 | 0.98 |

Against a constant per-period probability, the additive core model's log-loss gain is 27.0%.
Survey-weighted, it is 29.3%, with a C-index of 0.893. Religion pairing and parental approval
add nothing on top of the core inputs. Boosting is about 0.8 points better with overlapping
intervals. It is not exported because the engine has no logistic boosting kind, while the
additive model is exactly explainable.

**By subgroup (additive core, C-index):** married 0.84 (0.80–0.88), unmarried 0.755
(0.73–0.78), different-sex 0.886 (0.871–0.901), same-sex 0.83 (0.79–0.86). Pooled skill is
high largely because the sample mixes stages of relationship: new, unmarried and
non-cohabiting couples against decades-long marriages. Within married couples it is lower, and
relationship quality alone gives a married-couple C-index of 0.76.

**Calibration:** the calibration slope of per-period hazards is 0.98 for the additive core
model. Cumulative calibration (`heldout_cumulative_calibration.csv`) compares Kaplan–Meier
observed break-up with the mean prediction in each risk decile at 2.2, 4.1 and 8.4 years. The
deciles track it, but the top decile is over-predicted at long horizons. At 8.4 years it is
0.90 predicted vs 0.79 observed (4.1 years: 0.82 vs 0.76; 2.2 years: 0.69 vs 0.67). **Decile lift** for break-up by 2011
(additive core): the top decile breaks up at 68.5%, 4.3 times the average. The bottom three
deciles had at most one break-up each (`heldout_decile_lift_2y.csv`).

### External check: HCMST 2017 → 2020 and 2022 (`external_validation_hcmst2017.csv`)

The 2009-trained models were applied to the 2,862 partnered 2017 respondents. The respondents
are different people and the calendar is different. Inputs were harmonised: income deflated
with CPI-U 2009/2017, party leaners counted as partisans, race from `ppethm` and Q6. The
additive **core** model is the one checked, because the 2017 file has no partner religion or
parental-approval item. Horizons of 3.17 years (Jul 2017 → Sep 2020) and 4.67 years (→ Mar
2022) are interpolated on the cumulative-hazard scale between period ends.

| Outcome | Couples | Break-ups | Model | AUC (95% CI) | Gain vs period-only | Observed/expected |
| --- | --- | --- | --- | --- | --- | --- |
| By 2020 | 1,658 | 183 | quality only | 0.722 (0.684–0.757) | 11.0% | 0.65 |
| By 2020 | 1,658 | 183 | additive core | **0.925 (0.906–0.941)** | 43.9% (38.6–48.7) | 0.90 (0.81–1.00) |
| By 2022 | 1,391 | 218 | quality only | 0.718 (0.684–0.752) | 11.4% | 0.77 |
| By 2022 | 1,391 | 218 | additive core | **0.928 (0.911–0.945)** | 46.7% (41.9–51.6) | 1.03 (0.94–1.13) |

The 2017 cohort breaks up less than the 2009 cohort's average: period-only O/E is 0.63 by 2020.
The additive model's covariates account for most of that gap. The 2020 window includes the
first months of the pandemic.

## Break-up rates (`breakup_rates_by_group.csv`; Kaplan–Meier, 95% couple-bootstrap CIs)

| Group | Couples | Break-ups | By 2011 (2.2 y), unweighted | By 2017 (8.4 y), unweighted | By 2017, weighted (`weight2`) |
| --- | --- | --- | --- | --- | --- |
| All | 3,009 | 527 | 14.8% | 25.2% (23.2–27.2) | 21.9% (19.5–24.4) |
| Quality excellent | 1,771 | 168 | 7.7% | 14.3% (12.3–16.6) | 11.8% (9.5–14.4) |
| Quality good | 911 | 232 | 20.5% | 36.3% (32.2–40.7) | 31.2% (26.3–36.8) |
| Quality fair | 252 | 96 | 35.9% | 55.0% (47.2–63.0) | 58.1% (47.2–69.4) |
| Quality poor/very poor | 62 | 28 | 49.5% | 60.3% (43.5–75.8) | 49.2% (31.3–70.5) |
| Married | 1,928 | 118 | 3.2% | 10.7% (8.6–12.8) | 8.4% (6.3–10.7) |
| Unmarried | 1,081 | 409 | 35.4% | 50.7% (46.8–54.4) | 55.6% (50.0–60.9) |
| Married, excellent | 1,242 | 27 | 0.8% | 4.6% (2.9–6.9) | 3.0% (1.7–4.8) |
| Married, good | 511 | 54 | 5.2% | 18.9% (14.1–24.0) | 14.6% (9.6–20.5) |
| Married, fair | 118 | 20 | 6.6% | 27.5% (17.4–38.9) | 34.0% (19.6–49.3) |
| Married, poor/very poor | 47 | 16 | 37.5% | 47.1% (30.2–65.9) | 35.5% (20.0–54.8) |
| Unmarried, excellent | 529 | 141 | 24.4% | 37.4% (32.3–42.9) | 43.3% (35.3–51.5) |
| Unmarried, good | 400 | 178 | 39.4% | 57.4% (51.3–63.8) | 59.9% (51.3–68.8) |
| Unmarried, fair | 134 | 76 | 61.1% | 80.1% (69.3–90.4) | 79.4% (65.7–94.1) |
| Unmarried, poor/very poor | 15 | 12 | 84.6% | 100% (12 break-ups among 13 followed; too few for a CI) | — |
| Two men | 242 | 58 | 21.7% | 34.8% (27.5–42.9) | 45.5% (25.9–63.7) |
| Two women | 232 | 68 | 24.5% | 39.4% (31.5–47.6) | 57.5% (43.0–70.3) |
| Met online | 286 | 101 | 31.6% | 47.3% (40.0–55.6) | 41.7% (31.6–54.3) |

The weighted same-sex rates rest on a few heavily weighted general-population same-sex
couples. The weights notes advise against weighting within same-sex couples. Meeting online
looks riskier only crudely: holding the other inputs fixed, its odds ratio is 0.89 (below).

## Odds ratios (`odds_ratios.csv`)

A near-unpenalised linear-logit hazard with readable units and all inputs. It is not exported.
The 95% CIs come from 300 couple-bootstrap refits. **Associations, not causes.**

| Term (reference) | OR (95% CI) |
| --- | --- |
| Quality good (excellent) | 2.57 (2.02–3.41) |
| Quality fair | 5.11 (3.53–7.75) |
| Quality poor or very poor | 13.7 (7.1–29.5) |
| Not married (married) | 2.08 (1.55–3.09) |
| Not living together (living together) | 3.56 (2.69–4.87) |
| Each doubling of (years together + 1) | 0.66 (0.57–0.74) |
| Mean age, per 10 years | 0.78 (0.67–0.90) |
| Mean schooling, per 4 years | 0.76 (0.58–0.96) |
| Respondent married before (no) | 1.48 (1.17–1.94) |
| Two women (man-woman) | 2.57 (1.78–3.96) |
| Two men (man-woman) | 1.34 (0.94–2.10) |
| Met online (through friends) | 0.89 (0.61–1.18) |
| Interracial (both White) | 1.08 (0.81–1.44) |
| Age gap, per 5 years | 1.08 (0.95–1.19) |
| Income, per $50k | 0.95 (0.83–1.08) |
| Different religions (same) | 1.11 (0.83–1.46) |
| One Republican, one Democrat (both Democrats) | 1.03 (0.64–1.69) |
| Parents disapprove (approve) | 0.73 (0.41–1.14) |

`partial_effects_8y.csv` shows what the exported models do to 8.4-year break-up when one input
changes for a reference couple: a married, cohabiting, different-sex, both-White couple who
met through friends, with median age, schooling, income and duration, gets 7.0% from the core
model. Rating the relationship fair instead of excellent gives +19.7 points. Not living
together gives +15.3, and being unmarried +6.4.

## Population reference (`population_reference` in the bundle; `population_reference_quantiles.csv`)

For the owner's population-comparison feature, the bundle has survey-weighted (`weight2`)
quantiles (p1, p5, p10, p25, p50, p75, p90, p95, p99) of **held-out** predicted probability
of a break-up by 2.2, 4.1 and 8.4 years. They are given for the `quality_only`,
`additive_core` and `additive_full` models, among all 3,009 couples and by subgroup: married or
unmarried, different-sex or same-sex, relationship-quality level, age band (mean age under 30,
30–44, 45–59, 60+), schooling band (mean years under 12, 12–13.5, 14–15.5, 16+), how met,
interracial or same race-ethnicity, and duration band (under 2, 2–4, 5–9, 10–19, 20+ years).
Predictions are the out-of-fold hazards averaged over the five repeats, so no couple is scored
by a model that saw it. Cells need ≥ 100 unweighted couples. Cells with 50–99 are kept and
marked `small_cell: true`: "Poor or very poor" quality (62) and met at church (78). Smaller
cells are dropped. Every cell records `n` and its weighted population share. Tails are
withheld so that no quantile is effectively one couple's value: p5/p95 need ≥ 200 couples and
p1/p99 ≥ 500, otherwise they are `null`. Nothing person-level is stored. For the additive core
model, the weighted median 8.4-year probability is 11.2% overall, 7.1% for married and 60% for
unmarried couples.

## Exported bundle

`../../app/models/hcmst_couples.json` (`outcome: probability_per_period`) holds five models:
`period_only`, `quality_only`, `additive_core`, `additive_full` (`logistic_glm`) and
`tree_depth3` (`tree`). Each has held-out metrics with CIs, subgroup C-indices and, for the
core models, the external 2017 scores. The bundle also has `periods` with `time_offsets`,
`how_to_combine` (P(no break-up through k) = Π (1 − p_j)), `support` (central 99% of each
numeric input), `abstain`, an `ood` Mahalanobis spec (`app/tools/ood.py`), `rates_by_group`
and `population_reference`. `app/tests/hcmst.test.mjs` checks every model against
scikit-learn on 80 rows to 1e-9, including unseen categories and missing numbers, and checks
the OOD distances. **To show it in the app, add a `models/index.json` entry**
(`tests/lenses.test.mjs` requires one). This session was told not to edit that file.

## Limits

- **One partner's view.** Relationship quality, the partner's age, schooling, party and
  religion, and how they met are all the respondent's report. The other partner's quality
  rating, which may matter as much, is not observed.
- **Attrition.** 384 of 3,009 couples were never re-interviewed, and response fell to 46% by
  wave 5. Censoring is assumed to be unrelated to break-up given the inputs. HCMST's own
  follow-up rates are in the user guide.
- **Timing.** Periods are 1.1–2.6 years long, so the models give per-period probabilities, not
  annual rates. Break-ups are placed by reported month or by the reporting wave.
- **Mixed stages.** High pooled discrimination mostly separates new, unmarried and
  non-cohabiting couples from long marriages. For a long-married couple, expect the married
  subgroup's skill (C ≈ 0.84) and low absolute risk.
- **Associations, not causes.** For example, couples who rate their relationship "good" rather
  than "excellent" break up more often, but a better rating does not cause a lasting
  relationship.
- **Cohort and era.** The study covers 2009–2017 (and 2017–2022 externally). Partners who
  died are censored, and wave-1 inputs other than duration and age are held fixed.

## Reproduce

```sh
sh download.sh                       # fetches into raw/, unzips, checks SHA256SUMS
pip install -r requirements.txt      # numpy, pandas, scikit-learn 1.7.2, pyreadstat
OMP_NUM_THREADS=1 python3 train_models.py   # ~4-16 min; writes the CSVs, sample_audit.json,
                                     # tree_depth3.txt and ../../app/models/hcmst_couples{,_testvectors}.json
node --test ../../app/tests/hcmst.test.mjs
```

`HCMST_RAW=/path` points the script at another raw folder. On a busy machine, set
`OMP_NUM_THREADS=1`: HistGradientBoosting's OpenMP threads otherwise slow it by about 100×.
