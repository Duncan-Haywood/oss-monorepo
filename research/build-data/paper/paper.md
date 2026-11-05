# Open permit feeds predict permit duration only where the city's own history is available: a three-city benchmark with a forward-in-time split

Draft 0 (session 13, 2026-11-01; section 4.1 and the to-do list updated 2026-11-03). AI-assisted work; no affiliation with any city,
agency or journal. Not legal, engineering or financial advice. Every number below
is copied from `../LOG.md` and `../results/`; nothing here is new compute. Target
venue: *Automation in Construction* (an aim, not a claim of acceptance; submitting
is an owner step). Venue formatting is still to do.

## Abstract

Homeowners, contractors and lenders plan around permit and build durations that
permit offices do not publish as forecasts. We load the public permit feeds of
Chicago (851,889 rows), San Francisco (1,297,749) and Austin (2,383,195) onto one
schema and forecast two lags, application to issue (a2i) and issue to completion
(i2c), with a forward-in-time split (train to 2022, tune on 2023, test 2024). Five
findings. (1) The target is zero-inflated: the median a2i lag is 0 days in all three
cities, but the 2024 same-day share differs sharply (Austin 6%, Chicago 30%, SF 55%).
(2) A LightGBM quantile model beats the per-city, per-permit-type empirical-quantile
baseline on pinball loss in 13 of 15 city/target/quantile cells, by 2 to 36%; in
Chicago a2i it loses at the 0.1 and 0.9 quantiles. (3) Split-conformal intervals do
not hold the nominal 80% in 2024 in three of five pairs (0.86 to 0.89 against 0.80),
because same-day permits tie the conformity scores at zero and the method cannot
narrow the interval; dequantising, Mondrian grouping and rolling calibration do not fix
it, and choosing tighter quantile levels does on SF but not on Chicago (4.2a). (4) A model trained on the other cities is worse than the
held-out city's own baseline in 13 of 15 cells (+2 to +137%). (5) A model pooled with
the other cities plus n rows of the new city needs more than 1000 local rows to
match the city's full-history baseline in Chicago and San Francisco a2i, and a
per-type table built from a few hundred local rows is usually as good. The practical
reading is that a national model does not replace per-city history, and a new city
should collect its own few thousand permits first.

## 1 Introduction and related work

Reference-class forecasting (Flyvbjerg 2006) says to use the distribution of
comparable past projects; our baseline is the permit-feed version, a per-city,
per-permit-type empirical quantile. Published construction-duration models mostly
use one agency's or firm's project data (Gondia et al. 2020), with no public data
and no calibrated intervals. We ask whether open, multi-city feeds support a
reproducible benchmark. Models: gradient-boosted trees (Chen and Guestrin 2016;
Prokhorenkova et al. 2018), which tend to lead on tabular data (Grinsztajn et al.
2022; Shwartz-Ziv and Armon 2022); we run LightGBM, XGBoost and CatBoost. Scoring: pinball loss
(Koenker and Bassett 1978) as a strictly proper rule for quantiles (Gneiting and
Raftery 2007). Intervals: conformalised quantile regression (Romano et al. 2019;
Angelopoulos and Bates 2021). Field attribution: permutation importance, with
Lundberg and Lee (2017) as the alternative we did not run. Feeds are documented
with datasheets (Gebru et al. 2018). Full references are in `../PROPOSAL.md`; all
twelve resolved in session 1.

## 2 Data

Socrata SoQL pulls, stored outside git; loader `../src/permits.py`; datasheets in
`../datasheets/`. Licences: San Francisco ODC PDDL; Austin US-government public
domain; Chicago "See Terms of Use", so derived rows are not redistributed.
Chicago contains only issued permits (survivorship bias) and has no completion
date, so i2c is SF and Austin only. Negative lags (entry-order errors) are dropped
and counted in the manifest. Austin cost (`total_job_valuation`) is non-zero on 49%
of rows, so a zero may mean "not stated". Median a2i lag is 0 days everywhere
(session 2 p90: Chicago 56, SF 81, Austin 142; build time median about 105 days in
SF and Austin).

## 3 Method

Forward split: train to year Y-2, tune/calibrate on Y-1, test on Y = 2024.
Features: permit type, work class, log cost, area (top 60), description length,
month, weekday; no calendar year. Baseline: per-type empirical quantile (type 7),
fallback below 30 rows. Model: LightGBM quantile at 0.1, 0.5, 0.9, three seeds,
one fixed configuration (learning rate 0.15, up to 300 rounds), not tuned on the
test year. Uncertainty: paired week-block bootstrap (2,000 resamples) over test
weeks. Hypotheses H1 to H5 were written in `../LOG.md` before each run.

## 4 Results

### 4.1 Boosted model versus the baseline (H1 holds)

Mean pinball loss, test 2024, relative change (boosted against baseline); the
bootstrap interval excludes zero in every cell listed.

| pair | q0.1 | q0.5 | q0.9 |
|---|---|---|---|
| Austin a2i | -4.6% | -26.0% | -35.9% |
| Austin i2c | -6.6% | -18.1% | -20.5% |
| Chicago a2i | +0.3% | -9.7% | +6.5% |
| SF a2i | -1.6% | -4.7% | -17.5% |
| SF i2c | -5.9% | -12.7% | -3.0% |

Table source: `../results/m3_table.md`. Caveat: a boosted model beating the
weakest fixed reference class is a low bar, so milestones 14 to 17 add XGBoost,
CatBoost and a linear quantile regression (20,000 training rows) on all five pairs
(`../results/baselines_*`, `../results/catboost_*`, feeds re-pulled 2026-11-03;
week-block bootstrap intervals are in `../LOG.md` sessions 14 to 17). Relative
change of mean pinball loss against the reference class:

| pair | model | q0.1 | q0.5 | q0.9 |
|---|---|---|---|---|
| Chicago a2i | XGBoost | +0.3% | -10.5% | +4.9% |
| Chicago a2i | CatBoost | +0.4% | -7.8% | +2.4% |
| Chicago a2i | linear | +0.0% | -2.3% | +72.9% |
| SF a2i | XGBoost | -0.7% | -3.8% | -17.7% |
| SF a2i | CatBoost | -0.4% | -4.5% | -17.0% |
| SF a2i | linear | -0.0% | +0.1% | -16.7% |
| Austin a2i | XGBoost | -6.9% | -25.7% | -35.9% |
| Austin a2i | CatBoost | -4.9% | -22.9% | -31.5% |
| Austin a2i | linear | -0.8% | -14.5% | -28.0% |
| SF i2c | XGBoost | -6.3% | -12.5% | -3.2% |
| SF i2c | CatBoost | -6.2% | -12.8% | -1.7% |
| SF i2c | linear | -2.8% | -5.6% | +1.9% |
| Austin i2c | XGBoost | -6.9% | -18.1% | -20.1% |
| Austin i2c | CatBoost | -6.5% | -18.0% | -19.7% |
| Austin i2c | linear | -4.0% | -12.3% | -16.6% |

Three tree libraries agree: XGBoost is within 3 points of LightGBM in every cell
checked and CatBoost within 3 points of XGBoost in 14 of 15 (Austin a2i q0.9, 4.4
points weaker), so the gain is a property of the data, not one library. The q0.9
loss to the reference class in Chicago a2i holds for all three trees. The linear
model trails the trees at q0.5 everywhere and fails badly only in Chicago a2i
(+72.9% at q0.9), so that failure depends on the city's permit-type structure.
Defaults are shared, not tuned per library. A neural net is not run.

### 4.2 Coverage (H2 refuted)

Conformal 80% coverage, 2024: Austin a2i 0.816, Austin i2c 0.813, Chicago a2i
0.860, SF a2i 0.891, SF i2c 0.834. Across all 15 city/target/year cells (2022 to
2024) 7 are within 3 points of 0.80. In Chicago and SF a2i the conformal quantile
is exactly 0, so conformal equals raw: the lower end is clipped at 0 and same-day
permits tie the scores. Where the raw interval under-covers, conformal widens it by
3.5 to 22 days and gains 4 to 11 points. The two-sample KS statistic of calibration
against test scores is 0.02 to 0.07 except Chicago a2i 2024 (0.246).

### 4.2a Can the over-coverage be repaired? Four attempts, one partial success (H2b to H2e)

Chicago and SF a2i over-cover (0.860 and 0.891 in 4.2) and conformal calibration cannot
narrow them. We tried four fixes, each pre-registered in `LOG.md` before the run (2024 test
year, 3 seeds, fresh pulls; results in `results/conformal_*_2024.json`). Target band: 77 to 83%.

| attempt | what it changes | outcome |
|---|---|---|
| H2b dequantised CQR (uniform jitter on integer days) | breaks the score ties at 0 | in the band in 3 of 5 pairs (plain CQR 2 of 5); Chicago a2i 0.556, SF a2i 0.344 before rounding the interval outward, 0.866 and 0.901 after |
| H2c Mondrian CQR by predicted P(same day) band | one qhat per band | in the band in 0 of 4 finished pairs; every Chicago and SF a2i band has qhat 0 |
| H2d rolling and adaptive calibration over 2024 | calibration set closer in time | no-op: weekly qhat is 0 for every window and for adaptive conformal (gamma 0.02); coverage stays 0.867 and 0.901 |
| H2e choose the quantile pair (tau_lo, tau_hi) by calibration width | tighter base interval | SF a2i in the band (0.828) with a 57% narrower interval (27.2 vs 63.3 days); Chicago a2i out (0.748, width 24.5 vs 67.9 days) |

Why the first three fail: the same-day share is a point mass at score 0. In Chicago it fell
from 0.520 (2023) to 0.304 (2024); in SF it was 0.515 and 0.554. While that mass exceeds the
20% allowed, the 80th-percentile score sits on it and qhat is 0, so no calibration window or
grouping can move it. Coverage above 80% comes from the base interval (63 to 68 days wide)
containing the long tail. The lever is the base quantile pair, not the calibration.

H2e shows narrowing is available and safe on SF, but on Chicago the calibration-width rule
picks the tightest pair, whose calibration coverage (0.808) falls to 0.748 in 2024: the
same-day drift now acts on a nonzero qhat. In the grid only Chicago (0.2, 0.85) lands in the
band (0.805, width 39.1), a post-hoc observation, not a result. One test year for H2e.

### 4.2b A drift-guarded quantile-pair rule over three test years (H2f refuted)

Pre-registered in `LOG.md` (session 25): choose the (tau_lo, tau_hi) pair that is narrowest among pairs whose calibration coverage is at least 0.78 in both halves of the calibration year. Chicago and SF a2i, test years 2022 to 2024, 3 seeds; `results/conformal_tau_drift_*`. Coverage / mean width in days:

| city, year | guarded rule | fixed (0.1, 0.9) |
|---|---|---|
| Chicago 2022 | 0.817 / 17.6 | 0.853 / 52.7 |
| Chicago 2023 | 0.729 / 16.2 | 0.838 / 56.4 |
| Chicago 2024 | 0.762 / 31.0 | 0.867 / 67.9 |
| SF 2022 | 0.861 / 84.0 | 0.861 / 84.0 |
| SF 2023 | 0.842 / 39.4 | 0.850 / 64.8 |
| SF 2024 | 0.828 / 27.2 | 0.900 / 63.4 |

The guarded rule is inside 77 to 83% in 2 of 6 cells (the unguarded rule of 4.2a also 2 of 6), so H2f is refuted; the width half held (at least 15% narrower in 5 of 6; SF 2022 fell back to the fixed pair). Chicago 2023 under-covers by 5 points although calibration coverage was 0.81 in both halves, so the shortfall is year-to-year, not within-year drift. Reading: tighter pairs give 2 to 4 times narrower SF intervals at 0.83 to 0.84 coverage, but for Chicago no rule using the calibration year alone chooses safely; keep (0.1, 0.9) there. Limits: two cities, three years, 3 seeds, a hand-set 0.78 threshold.

### 4.2c A one-year backtest for the quantile-pair rule (H2g refuted)

Choosing the pair among those that also covered at least 77% in the previous test year gives, for Chicago and San Francisco application-to-issue over test years 2022 to 2024 (3 seeds), coverage inside 77 to 83% in 3 of 6 cells and an interval 26 to 71% narrower than the (0.1, 0.9) pair in 6 of 6. Chicago 2024 improves (0.786 against 0.748 and 0.762 for the earlier rules) but Chicago 2023 stays at 0.729; San Francisco sits at 0.83 to 0.85. Chicago's narrow-pair coverage was 0.775, 0.817, 0.729 and 0.786 in 2021 to 2024, so last year's coverage did not predict the next. We therefore report a Chicago limit: a user who needs 80% should keep the wide pair. Numbers are copied from `../LOG.md`, session 27, and `../results/conformal_tau_backtest.txt`; the backtest uses some outcomes not known at the start of the year, a slight flatter.

Austin application-to-issue, run afterwards with the same rules (1 seed, one job at a time; `../results/conformal_tau_drift_austin_a2i_{2021..2024}.json`, `python3 src/conformal_tau_backtest.py austin`), gives coverage 0.781 [0.767, 0.794] in 2022 (fallback to the fixed pair), 0.862 [0.849, 0.874] in 2023 and 0.828 [0.819, 0.836] in 2024: inside 77 to 83% in 2 of 3 years, but at least 15% narrower in only 1 of 3 (widths 170.1, 164.2 and 118.6 days; the fixed pair is about 170). Only 6% of Austin permits are same-day and its tail is long, so a narrower pair buys little: the width gain of 26 to 71% seen in Chicago and San Francisco does not carry over. Austin's coverage under the fixed pair ran 0.749, 0.781, 0.858 and 0.854 for 2021 to 2024, a drift of about 10 points, which again points to year-to-year shift rather than method. Limits: 1 seed so intervals are over weeks only; the loader counts every Austin row as issued (session 5 item); i2c not run.

Austin issue-to-completion, same rules (1 seed; `../results/conformal_tau_drift_austin_i2c_{2021..2024}.json`, `python3 src/conformal_tau_backtest.py austin --i2c`): H2g is refuted on both halves. Test coverage was 0.786 (2022, fixed-pair fallback), 0.842 (2023) and 0.835 (2024), so 1 of 3 years is inside 77 to 83%; width fell by 0%, 6% and 18%, so 1 of 3 clears 15%. Interval widths are 240 to 310 days at 80%, and the fixed pair's coverage drifted 0.731, 0.786, 0.837, 0.819 over 2021 to 2024. Limits: 1 seed, 3 cells, 3,533 negative build times dropped. A narrow quantile pair buys a large width gain only where the target is zero-inflated (Chicago and SF application-to-issue), not in either Austin target.

San Francisco issue-to-completion, same rules (1 seed; `../results/conformal_tau_drift_sf_i2c_{2021..2024}.json`, `python3 src/conformal_tau_backtest.py sf --i2c`; `../LOG.md`, session 32): test coverage was 0.818 [0.810, 0.826] (2022), 0.830 [0.822, 0.837] (2023) and 0.857 [0.846, 0.867] (2024), so 2 of 3 years are inside 77 to 83%; width fell by 12%, 17% and 28%, so 2 of 3 clear 15%. Each half therefore holds when counted separately, unlike Austin i2c, but only 2023 passes both in the same year (2022 is not narrow enough, 2024 over-covers), so the strict joint reading is 1 of 3. Widths are 290 to 370 days at 80%. Limits: 1 seed, 3 cells, SF only (Chicago has no completion date), backtest years only.

### 4.3 Which fields (H3, as worded)

Permutation importance: the smallest number of fields reaching 80% of the total
(k80) is 2 to 4 of 6 to 7. The top field is work class in Austin (68%, 65%) and
Chicago (39%), permit type in SF a2i (70%), log cost in SF i2c (66%); month and
weekday are near zero. This is reliance, not a decomposition of the gain: the
importances sum to 1.7 to 3.4 times the gain in four pairs and 20 times in Chicago
a2i, where the gain is 0.17 days. Source: `../results/m5_table.md`.

### 4.4 Transfer across cities (H4 holds)

Trained on the other cities, tested on the held-out city: worse than that city's
own baseline in 13 of 15 cells (Chicago a2i +16, +38, +84%; SF a2i +2.1, +14.7,
+3.8%; Austin a2i about 0, 0, +62.5%; Austin i2c +66, +137, +79%); better only at
SF i2c q0.1 (-2.8%). Austin's transfer interval covers 0.61 to 0.63. An own-city
model on the same harmonised features beats the baseline in Austin, so the cost is
moving between cities, not the thin feature set. i2c transfer has a single source
city.

### 4.5 Pooled model plus a small local sample (H5 holds; secondary refuted)

Five draws of the local rows, source rows capped at 100,000 per city, a2i only.
The first n at which the pooled model (local weight 20) is at or below the city's
full-history baseline: Austin 300; Chicago and SF not within 3000. At n = 3000:
Chicago +14.1%, SF +5.9%, Austin -8.8%. The pooled model beat a baseline built from
the same n local rows in 8 of 24 pair/n/weight cells (6 in Austin). In Austin a
boosted model on the local rows alone is as good or better than pooling at every n.

## 5 Limitations

One test year (2024) for H1, H3, H4, H5; three seeds (two for conformal); one fixed
configuration per library (defaults, untuned); the neural net in the proposal is not run; the
harmonised class map is a keyword rule not validated against hand labels; Chicago
is survivorship-biased and has no i2c; "completed" is a status date; the spread over
draws in 4.5 is not reported; i2c is not rerun for H5b; no fourth city (NYC DOB NOW
licence unchecked). Drift years 2022 and 2023 exist only for conformal coverage; 4.2a uses 2024 only and does not run Austin or i2c for H2d and H2e.

## 6 What a practitioner can take

For a new city, start with the per-type empirical quantile of its own recent
permits; a few hundred rows already come close to the full-history version. Do not
rely on a model trained elsewhere, and do not trust the nominal coverage of a
conformal interval where a large share of lags are exactly zero: check the same-day share first;
tighter quantile levels (4.2a) can halve the width, but pick them with drift in mind.

## 7 To do before submission

1. A neural net baseline; per-library tuning (Austin a2i CatBoost gap).
2. A year-ahead (Y-2 versus Y-1) calibration check for the quantile pair (4.2b did not solve Chicago); (H2g now run for every city and target that has one; see 4.2c).
3. Spread over draws and i2c for 4.5; first-n-rows ordering instead of random draws.
4. Multiple test years for H1; a fourth city after a licence check.
5. Publish the permit-duration prior data file for `ventures/` (milestone 7).
6. Re-run `research/_shared/cite_check.py` at submission and re-check novelty.
