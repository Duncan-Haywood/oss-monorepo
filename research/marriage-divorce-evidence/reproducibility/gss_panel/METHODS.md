# GSS panels 2006–2020: does an unhappy marriage predict divorce two years later?

This is the project's **prospective relationship-quality lens**. The General Social Survey
re-interviewed the same people two and four years apart. Here we take respondents who were
married at one interview, record how happy they said their marriage was (HAPMAR) along with
about 25 other answers, and ask whether they were divorced or separated at the next
interview. Every predictor is measured **before** the outcome.

**Headline.** Among 4,453 two-year follow-ups of married respondents (2,754 people, 203
dissolutions), the survey-weighted share divorced or separated two years later was:

| HAPMAR at wave *t* | Follow-ups | Dissolutions | 2-year rate (95% CI) | vs "very happy" (95% CI) |
| --- | --- | --- | --- | --- |
| Very happy | 2,669 | 69 | **2.5%** (1.9–3.2) | 1 |
| Pretty happy | 1,623 | 90 | **5.5%** (4.2–7.0) | 2.2× (1.5–3.2) |
| Not too happy | 140 | 38 | **23.6%** (16.5–31.2) | 9.4× (6.0–14.3) |
| Did not answer | 21 | 6 | 21.6% (6.3–40.5) | — |

Over four years (2,143 people, 166 dissolutions): 5.2% (3.8–6.7), 10.9% (8.1–13.9) and
30.8% (19.9–43.3). Most married people (about 60%) call their marriage "very happy", and
only about 3% call it "not too happy". So most divorces two years later still come from
marriages described as "very" or "pretty" happy: 159 of the 203.

An additive logistic model using all the wave-*t* answers reduces held-out log loss by
**8.6%** (95% CI 4.8–12.3) against a constant rate, with AUC **0.727** (0.682–0.771).
HAPMAR alone gives 5.6% (2.7–8.4) and AUC 0.629. Gradient boosting reaches 9.7% and AUC
0.740 but is not exported (see below). These are modest gains: most of what ends a marriage
in the next two years is not in these answers.

## Data and verification

- **Source:** NORC at the University of Chicago, official Stata files from
  `https://gss.norc.org/get-the-data/stata.html` (`download.sh`): `GSS_2006_Panel_Stata.zip`,
  `GSS_2008_Panel_stata.zip`, `GSS_2010_Panel_stata.zip`, `GSS_2020_panel_stata_1a.zip`
  (with its codebook), and the cumulative `GSS_stata.zip` (1972–2024, release 3a) for the
  cross-sectional analysis. `SHA256SUMS` records the archives and the extracted `.dta` files.
- **Counts checked against NORC's documentation.** `gss_data.respondents()` asserts them on
  every run, and `sample_audit.json` records them:
  - 2006 panel: 2,000 / 1,536 / 1,276 (2006 / 2008 / 2010), as stated in "Release Notes for
    GSS Panel 2006-sample";
  - 2008 panel: 2,023 / 1,581 / 1,295 (2008 / 2010 / 2012), release notes for the 2008 sample;
  - 2010 panel: 2,044 / 1,551 / 1,304 (2010 / 2012 / 2014), release notes for the 2010 sample;
  - 2016–2020 panel: 2,867 (2016) + 2,348 (2018) wave-1 respondents, with 809 + 1,014 =
    1,823 re-interviewed in 2020 and 721 of the 2016 cases not selected (codebook R1a,
    Table 2).
  No one in the older panels was interviewed at wave 3 without wave 2.
- **Terms and citation.** NORC asks publications to cite the source. The codebooks carry
  an MIT-style permission notice that covers the codebook text. This folder commits only
  scripts, checksums and aggregate outputs; no records. The citations, as given in the
  codebooks:
  - Davern, Michael; Bautista, Rene; Freese, Jeremy; Herd, Pamela; and Morgan, Stephen L.
    *General Social Survey 1972-2024.* [Machine-readable data file]. NORC ed. Chicago, 2026
    (Release 3a).
  - Davern, Michael; Bautista, Rene; Freese, Jeremy; Morgan, Stephen L.; and Tom W. Smith.
    *General Social Survey 2016-2020 Panel.* [Machine-readable data file]. NORC ed.
    Chicago, 2021 (Release 1a).
  - The 2006, 2008 and 2010 three-wave panel files (releases R6a, R6 and R6), NORC at the
    University of Chicago, gss.norc.org.

## Sample and outcome

A **transition** is a respondent married (MARITAL = 1) at wave *t*, followed to a later wave.

| Horizon | Transitions used | Weight (NORC's recommendation) |
| --- | --- | --- |
| 2 years | 2006→08, 2008→10 (2006 panel); 2008→10, 2010→12; 2010→12, 2012→14; 2018→20 | WTPANNR12 for waves 1→2, WTPANNR123 for 2→3, WTSSNR_2 for 2018→20 |
| 4 years | 2006→10, 2008→12, 2010→14 (waves 1→3); 2016→20 | WTPANNR123; WTSSNR_2 |

- **Event:** divorced (3) or separated (4) at the follow-up. For the 4-year horizon in the
  older panels, a dissolution reported at the middle wave also counts, so a quick
  remarriage is not missed.
- **Excluded from the denominator:** widowed at follow-up (78 two-year, 68 four-year),
  "never married" at follow-up (an inconsistent report: 38 and 18), and a missing status (3
  and 1). These are listed in `sample_flow.csv` and `attrition_by_hapmar.csv`.
- **A person can contribute two 2-year transitions** (waves 1→2 and 2→3), so all
  validation folds and bootstraps are clustered on the respondent.
- Weights are normalised to mean 1 within each analysis sample. The 2016–2020 panel weight
  gives each cohort half the 1,823 cases (codebook, "Weights").

**Sensitivity outcomes** (`hapmar_dissolution_rates.csv`, column `variant`):

- *Divorce only* (separation not counted): 1.5%, 2.3% and 12.6% by HAPMAR.
- *Also counting a no-to-yes flip in the "ever divorced or separated" item* while married at
  both waves: 44 two-year cases. This can be a divorce and remarriage within two years or a
  reporting error. It gives 3.3%, 6.8% and 24.8%.
- *Unweighted*: 2.6%, 5.6% and 27.1%.
- *By era*: 2006–2014 panels 2.6%, 5.6% and 24.4%. In the 2016–2020 panel the cells are
  small (11 "not too happy" two-year follow-ups): 1.4%, 4.8% and 13.0%, with wide CIs.

## Attrition

About a quarter of married respondents were not re-interviewed two years later, and 40% were
not re-interviewed four years later. Attrition is **similar across HAPMAR levels**
(`attrition_by_hapmar.csv`). Re-interviewed at two years: 74.7% of "very happy", 77.2% of
"pretty happy" and 73.5% of "not too happy". At four years: 59.6%, 61.7% and 55.0%.

Attrition is modelled explicitly. An unweighted logistic model of re-interview, among people
selected and alive, uses every wave-*t* predictor plus the panel (AUC 0.70 at two years, 0.68
at four). Holding the other traits fixed, HAPMAR barely predicts re-interview: odds ratios
versus "very happy" are 1.05 (pretty happy) and 0.93 (not too happy) at two years, and 1.17
and 0.96 at four (`sample_audit.json`, `attrition_model`). Re-weighting each re-interviewed transition by
NORC weight / predicted re-interview probability moves the HAPMAR rates very little: 2.5%,
5.5% and 22.9% at two years, and 5.2%, 11.2% and 29.1% at four.

This cannot rule out attrition that depends on the outcome itself: people who separate move
house and are harder to find. If anything, that would make the observed rates too low, and it
would not create the gradient.

## Predictors (all measured at wave *t*)

`item_availability.csv` gives the share answered for each item and transition. Many GSS items
are on split ballots or self-administered forms, so a missing answer is kept as its own
`Unknown` level. A categorical `Unknown` therefore means "not asked, refused or don't know"
rather than an imputed value.

| Input | GSS item | Asked |
| --- | --- | --- |
| `hapmar` | HAPMAR, happiness of marriage | all married |
| `happy` | HAPPY, general happiness | all |
| `age`, `sex`, `race` | AGE, SEX, RACE | all |
| `degree`, `spouse_degree` | DEGREE, SPDEG | all married |
| `work`, `spouse_work` | WRKSTAT, SPWRKSTA (grouped) | all married |
| `family_income` | CONINC, constant 2000 dollars, in four bands | about 90% |
| `religion`, `spouse_religion`, `same_religion` | RELIG, SPREL (and whether they match) | all married |
| `attend` | ATTEND, 0–8 | all |
| `childs` | CHILDS, 0–8 | all |
| `divorced_before` | DIVORCE, "ever been divorced or legally separated" | all married |
| `family_at_16` | FAMILY16 + FAMDIF16, with both parents at 16; if not, divorce or death | all |
| `health` | HEALTH | about two-thirds (split ballot) |
| `fefam` | FEFAM, traditional gender roles | about two-thirds |
| `sexfreq`, `evstray` | SEXFREQ, EVSTRAY (self-administered) | wave 1 of the 2006–2010 panels and the 2016/2018 waves only, about 60–85% |
| `satfin` | SATFIN | all |
| `xmarsex` | XMARSEX, extramarital sex wrong? | about two-thirds |
| `region`, `place` | REGION, SRCBELT (grouped) | all |

AGEWED (age at first marriage) is not in the panel files. In the cumulative file it was asked
only in 1972–1994 and 2006, so it is used only in the cross-sectional analysis. Marriage
duration is not measured.

## Models and held-out evaluation

- **Validation:** `StratifiedGroupKFold` by respondent, 5 folds, repeated 10 times with
  different seeds. All fits and scores use the panel weights. Scores are weighted log loss
  (the Bernoulli deviance, so its gain equals the deviance gain), weighted AUC and Brier
  score. The point estimate is the mean over repeats. The 95% CIs come from 1,000
  respondent-cluster bootstrap resamples of the out-of-fold predictions; each resample is
  scored on all 10 repeats and averaged. They reflect evaluation-sample uncertainty, not
  refitting.
- **Constant:** the training-fold weighted rate.
- **HAPMAR only:** logistic regression on the four HAPMAR levels (C = 100, which is nearly
  unpenalised).
- **Additive logistic:** an L1-penalised logistic regression on every input, with quadratic
  splines (4 quantile knots, linear extrapolation) for age, children and attendance. Missing
  numerics are imputed with the median and get missing-indicator columns. The penalty C is
  chosen from {0.1, 0.3, 1} by an **inner** grouped 4-fold CV inside each training fold, so
  the reported skill is not tuned on the test fold. The inner CV chose 0.3 in 48 of 50 folds
  (2-year). The exported fit uses the C chosen by the same inner CV on all data (0.1).
- **Tree:** a weighted `DecisionTreeRegressor`, depth 3, at least 300 transitions per leaf.
  Its leaves are probabilities. Only 140 transitions are "not too happy", so the tree cannot
  isolate them, and it splits on age, income and an earlier divorce instead
  (`tree_depth3.txt`).
- **Gradient boosting:** `HistGradientBoostingClassifier` (depth 3, 150 iterations, learning
  rate 0.03, at least 80 per leaf). Its settings were fixed before evaluation. It is reported
  here but **not exported**, because `app/engine.js` has no logistic gradient-boosting kind.
  The existing `boosted` kind uses a log link. Exporting it needs a one-line `sigmoid` variant
  in the engine.

| Horizon | Model | Log-loss gain vs constant (95% CI) | Range over repeats | AUC (95% CI) | Brier (95% CI) |
| --- | --- | --- | --- | --- | --- |
| 2 y | Constant | 0 | — | 0.5 | 0.0410 (0.035–0.048) |
| 2 y | HAPMAR only | 5.58% (2.73–8.36) | 5.20–5.85 | 0.629 (0.580–0.675) | 0.0398 |
| 2 y | **Additive logistic** | **8.63%** (4.76–12.31) | 7.74–9.54 | **0.727** (0.682–0.771) | 0.0394 |
| 2 y | Tree, depth 3 | 5.33% (2.65–7.77) | 1.74–6.73 | 0.685 (0.649–0.720) | 0.0404 |
| 2 y | Gradient boosting (not exported) | 9.73% (6.57–13.02) | 8.73–10.62 | 0.740 (0.702–0.777) | 0.0392 |
| 4 y | HAPMAR only | 3.33% (0.51–5.86) | 2.75–3.70 | 0.596 (0.539–0.646) | 0.0716 |
| 4 y | Additive logistic | 5.65% (−1.01–10.92) | 2.90–8.10 | 0.697 (0.627–0.755) | 0.0707 |

**Calibration and lift** (`heldout_calibration.csv`, deciles of the repeat-averaged held-out
prediction). For the 2-year additive model, the lowest decile was predicted at 0.6% and had
0 dissolutions among 454 transitions. The highest was predicted at 15.6% and observed at
14.4%, which is 3.3 times the overall rate. The top three deciles hold 131 of the 203 events.

## What predicts dissolution (associations, not causes)

`logistic_odds_ratios.csv` holds a near-unpenalised weighted logistic model with linear age,
children and attendance and all categorical inputs. Its 95% CIs come from 300
respondent-cluster bootstrap refits. The levels with the clearest associations at 2 years:

- **HAPMAR:** "pretty happy" has OR 2.07 (1.22–3.55) and "not too happy" OR 10.9
  (6.3–28.6) against "very happy", **holding everything else fixed**. General happiness
  (HAPPY) adds nothing once HAPMAR is in (ORs about 1.0–1.1).
- **Earlier divorce or separation:** OR 2.51 (1.76–4.14).
- **Age:** OR 0.64 (0.47–0.77) per 10 years.
- **Family income** below $40k (2000 dollars) versus $40–75k: ORs of about 1.7–1.9, with
  lower bounds near 1.0.
- **Suggestive, with CIs that include 1:** Black respondents 1.75 (0.97–3.04); no religion
  1.76 (0.96–3.64); parents divorced or separated by age 16, 1.60 (0.95–2.38); ever had sex
  outside the marriage (EVSTRAY) 1.59 (0.78–2.75).
- **Little or no association after adjustment:** own and spouse's degree, religious
  homogamy (1.03), attendance (1.02 per step), sex frequency, SATFIN, FEFAM and XMARSEX.

Rare levels, such as `Unknown` categories with a handful of cases, have unstable bootstrap
intervals. A bound of exactly 1.000 means the level was absent from some resamples. Do not
read those rows.

## Population reference (for the app's population comparison)

`population_reference.json`, which the bundle also carries as `population_reference`, gives
survey-weighted quantiles (p1, p5, p10, p15, …, p90, p95, p99) of the **held-out** predicted
probability from the additive logistic model. Each prediction is out-of-fold and averaged over
the 10 repeats, among the married respondents in each analysis sample. There is one set for
2 years and one for 4 years. Subgroups are sex, age band, own degree, spouse's degree, race,
HAPMAR, attendance band, number of children, earlier divorce and panel.

A cell is published only if it has at least 100 unweighted respondents. Its respondents and
records are recorded with it, and suppressed cells are listed by name. Nothing person-level
is stored. Example (2 years): the population median is 2.9%, p90 9.2% and p99 25.2%. For
"not too happy" marriages (121 respondents) the p10/p50/p90 are 7.0% / 18.0% / 35.7%. The
4-year "not too happy" cell has 63 respondents, so it is suppressed.

## Cross-sectional supporting evidence (GSS 1972–2024; `cross_section.py`)

This part is **cross-sectional and retrospective**. It does not estimate a rate, and some of
its traits are measured after any divorce. It uses the cumulative file (`gss7224_r3a.dta`;
75,699 records). The sample is the 57,753 ever-married respondents aged 18–89 whose
ever-divorced-or-separated status is known: MARITAL is divorced or separated, or the DIVORCE
item is answered. 22,193 of them are ever divorced or separated. The weight is WTSSPS.

Weighted share ever divorced or separated among the ever-married aged 35–64
(`xs_ever_divorced_by_group.csv`; bootstrap CIs by respondent, ignoring the PSU design):

- **Age at first marriage** (1972–1994 and 2006 only; n = 14,134): under 20, 44.1%; 20–22,
  31.8%; 23–25, 25.1%; 26–29, 24.1%; 30 or older, 21.3%.
- **Family at 16:** both parents 35.4%; parents divorced or separated 53.9%; a parent died
  40.2%.
- **Attendance at interview:** weekly or more 27.8%; never or under once a year 50.3%.
  Attendance can change after a divorce.
- **Degree:** bachelor's 30.6% and graduate 28.3%, against 42.7% for high school.
- **Religion raised in:** Catholic 35.2%, Protestant 41.9%, none 45.4%.
- **Survey decade:** 24.2% in the 1970s, rising to about 45% from the 2000s.

The logistic odds ratios (`xs_logistic_odds_ratios.csv`) adjust for age band, survey decade,
sex, race, degree, religion raised in, attendance and family at 16. In the AGEWED years,
marrying before 20 gives OR 2.52 (2.28–2.80) and marrying at 20–22 gives 1.44 versus 23–25.
Parents divorced or separated gives 1.73, and weekly attendance gives 0.49 versus yearly to
monthly. Treat these as supporting evidence for the prospective lenses, not as predictions.

## Limits

- **A 2-year (and 4-year) horizon, not a lifetime.** Do not convert these to lifetime risk.
  The bundle's `constant_rate` is the annual equivalent −ln(1−p)/2, included only for
  comparison with the rate lenses.
- **Current marriages of every duration.** Duration is not measured, and the sample
  over-represents long, surviving marriages. Few newly-weds are in it.
- **Small number of events (203).** The 2016–2020 panel adds few events, it was collected
  mostly by web during the 2020 pandemic, and its weighted retention was 40%.
- **One spouse's report.** HAPMAR is one person's view of the marriage. The spouse was not
  interviewed.
- **Separation counts as dissolution,** as in the NSFG lens. Divorce alone is a sensitivity.
- **Survey design:** NORC strata and PSUs are not used. Uncertainty comes from respondent
  clustering only.

## Files

- `gss_data.py`: reads the NORC files, checks the documented counts and builds the transitions.
- `train_models.py`: the panel analysis and the bundle export. It writes `sample_audit.json`,
  `sample_flow.csv`, `item_availability.csv`, `hapmar_dissolution_rates.csv`,
  `attrition_by_hapmar.csv`, `heldout_model_comparison.csv`, `heldout_calibration.csv`,
  `logistic_odds_ratios.csv`, `coefficients_logistic_additive.csv`, `tree_depth3.txt` and
  `population_reference.json`, plus `../../app/models/gss_panel_marriages{,_testvectors}.json`.
- `cross_section.py`: writes `xs_ever_divorced_by_group.csv`, `xs_logistic_odds_ratios.csv`
  and `xs_sample_audit.json`.

## Reproduce

```sh
sh download.sh                      # ~65 MB of archives into raw/ (GSS_RAW overrides), checks SHA256SUMS
pip install -r requirements.txt     # numpy, pandas, scikit-learn 1.7.2 (joblib comes with it)
GSS_RAW=raw python3 train_models.py # ~15-30 min on 4 cores; GSS_JOBS sets workers;
                                    # GSS_CV_CACHE=/path/outside/repo caches out-of-fold predictions
GSS_RAW=raw python3 cross_section.py
node --test ../../app/tests/gss_panel.test.mjs
GSS_RAW=raw python3 extended_predictors.py   # the 2026-10-20 extension below (~10 min)
```

## 2026-10-20 extension: family of origin, religion, politics, race, occupation and wealth (`extended_predictors.py`)

Every candidate is answered at wave *t*, before the outcome (family of origin and religion raised are
retrospective but fixed). Same 2-year sample (4,453 follow-ups, 2,754 people, 203 dissolutions),
weights and respondent-grouped folds as above; every variant is the additive L1 logistic at C = 0.3
(the inner CV's usual choice), 5 folds × 5 seeds, and the paired respondent-cluster bootstrap
(1,000) of each variant's difference from the current model (`../extended_eval.py`).

New inputs: `family_origin` (FAMILY16 + FAMDIF16: both parents / parents divorced or separated /
a parent died / stepfamily / other — the GSS cannot separate a never-married single parent, which
falls in "other"), siblings, parents' schooling, family income at 16, place at 16, born in the U.S.;
attendance with all nine ATTEND answers (so "more than once a week" is its own level), PRAY,
strength of affiliation (RELITEN), FUND, denomination families (RELIG × DENOM), religion raised
(RELIG16); POLVIEWS (7 points) and PARTYID (7 points + other); race and Hispanic origin from
RACECEN1-2 and HISPANIC (White, Black, Hispanic, Asian, AIAN, NHPI, multiracial, other); occupation
group (OCC10), own and spouse's occupational prestige; home ownership (DWELOWN) and household
wealth band (WEALTH, asked in 2006 and 2016-18 only).

| Variant (held out, 2 years) | Log-loss gain % (95% CI) | Minus current model, points (95% CI) |
| --- | --- | --- |
| Current model (same C, seeds) | 8.76 (4.62–12.74) | — |
| Family at 16 as yes/no instead of 4 levels | 9.11 (5.08–12.96) | +0.35 (−0.02 to +0.76) |
| Family of origin, 5 levels instead of 4 | 8.65 (4.63–12.59) | −0.11 (−0.36 to +0.17) |
| + all family-of-origin items | 7.64 (3.13–11.79) | −1.12 (−2.20 to −0.02) |
| + religion detail | 8.86 (4.77–12.82) | +0.10 (−0.62 to +0.80) |
| + politics | 9.00 (5.01–12.70) | +0.24 (−0.56 to +0.96) |
| + religion detail + politics | 9.26 (5.24–13.01) | +0.51 (−0.62 to +1.56) |
| + race detail | 8.69 (4.56–12.62) | −0.06 (−0.21 to +0.09) |
| + occupation and prestige | 8.37 (4.13–12.41) | −0.38 (−1.18 to +0.32) |
| + home ownership and wealth | 8.54 (4.35–12.50) | −0.21 (−0.36 to −0.07) |
| + all new blocks | 7.37 (2.62–11.70) | −1.39 (−2.95 to +0.24) |

**No block adds held-out skill whose interval excludes zero.** With 203 dissolutions the richer
inputs mostly add noise; family of origin as plain yes/no does at least as well as any finer coding.
Adjusted odds ratios (`extended_odds_ratios.csv`; near-unpenalised logistic with every current
input, a finer input replacing the coarser one it refines; 300 respondent-cluster refits) are
imprecise: parents divorced or separated 1.70 (0.91–3.26), a parent died 1.79 (0.61–5.19),
stepfamily 1.16 (0.63–2.48) vs both parents; Black 1.97 (1.02–3.57), multiracial 1.93
(0.93–3.97), Asian 1.17 (0.01–2.62) vs White; raised Catholic 0.31 (0.13–0.52) vs raised
Protestant; strong Democrats 2.01 (0.92–4.23) vs independents; each sibling 1.11 (1.01–1.18);
each prestige point 0.98 (0.96–1.00). Observed 2-year rates by level, with CIs, are in
`extended_rates.csv`. The bundle gains `models_extended` (current + religion detail + politics,
and current + all blocks) with `extended` test vectors, for transparency; the app does not score
them until the form asks for these inputs.

Other pre-outcome items the panels have and no model uses yet: WORDSUM (vocabulary), parents'
degrees, mother working when R was young (MAWRKGRW, where asked), BIBLE, REBORN, RELPERSN/SPRTPRSN
(religious and spiritual self-ratings), SEXFREQ and EVSTRAY are already in the model. They were not
tested here: with 203 events, the blocks above show the panels cannot support many more inputs.
