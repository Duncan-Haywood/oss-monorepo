# Open permit feeds predict permit duration only where the city's own history is available: a three-city benchmark with a forward-in-time split

Draft 0 (session 13, 2026-11-01). AI-assisted work; no affiliation with any city,
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
narrow the interval. (4) A model trained on the other cities is worse than the
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
2022; Shwartz-Ziv and Armon 2022); we run LightGBM only. Scoring: pinball loss
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
weakest fixed reference class is a low bar; a linear quantile regression, XGBoost,
CatBoost and a neural net, all in the proposal, are not run.

### 4.2 Coverage (H2 refuted)

Conformal 80% coverage, 2024: Austin a2i 0.816, Austin i2c 0.813, Chicago a2i
0.860, SF a2i 0.891, SF i2c 0.834. Across all 15 city/target/year cells (2022 to
2024) 7 are within 3 points of 0.80. In Chicago and SF a2i the conformal quantile
is exactly 0, so conformal equals raw: the lower end is clipped at 0 and same-day
permits tie the scores. Where the raw interval under-covers, conformal widens it by
3.5 to 22 days and gains 4 to 11 points. The two-sample KS statistic of calibration
against test scores is 0.02 to 0.07 except Chicago a2i 2024 (0.246).

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
LightGBM configuration; the other baselines in the proposal are not run; the
harmonised class map is a keyword rule not validated against hand labels; Chicago
is survivorship-biased and has no i2c; "completed" is a status date; the spread over
draws in 4.5 is not reported; i2c is not rerun for H5b; no fourth city (NYC DOB NOW
licence unchecked). Drift years 2022 and 2023 exist only for conformal coverage.

## 6 What a practitioner can take

For a new city, start with the per-type empirical quantile of its own recent
permits; a few hundred rows already come close to the full-history version. Do not
rely on a model trained elsewhere, and do not trust the nominal coverage of a
conformal interval where a large share of lags are exactly zero: model the
same-day indicator separately first.

## 7 To do before submission

1. Linear quantile regression, XGBoost/CatBoost and a neural net baseline (H1 is
   currently against the weakest bar).
2. Two-part conformal (same-day indicator, then tail) to repair 4.2.
3. Spread over draws and i2c for 4.5; first-n-rows ordering instead of random draws.
4. Multiple test years for H1; a fourth city after a licence check.
5. Publish the permit-duration prior data file for `ventures/` (milestone 7).
6. Re-run `research/_shared/cite_check.py` at submission and re-check novelty.
