# Open permit feeds predict permit duration only where the city's own history is available: a four-city benchmark with a forward-in-time split

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

A fourth city, Seattle (194,184 rows, public domain), was added afterwards with the same
code (4.8). Findings (2) to (5) above describe the three original cities. In Seattle the
boosted model also beats the baseline at all three quantiles in both targets (19 of 21
cells overall), and the three-key table is narrower than the baseline (a2i -7.4 days,
i2c -18.3, intervals exclude zero). Transfer to Seattle is mixed: a2i is worse at q0.9
(+27% in 2023 and 2024), but i2c transfer beats Seattle's own baseline at q0.1 and q0.5 in
both years (-6.7 to -10.7%) and at q0.9 only in 2024 (-5.1%; +11.2% in 2023). Transfer
intervals under-cover (0.61 to 0.72 against 0.80 nominal).

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
Defaults are shared, not tuned per library. A neural net is in 4.6.

### 4.1a H1 in two earlier test years

Same split rule and model, test years 2022 and 2023, 3 seeds (`../LOG.md`, session 37;
`../results/boosted_*_2022.json`, `*_2023.json`). Boosted beats the baseline on pinball in
15 of 15 cells in 2022 and 14 of 15 in 2023 (the miss is Chicago a2i q0.1, +0.1%, a tie);
the q0.5 gain is 10 to 21% and the q0.9 gain 6 to 36% in every pair. Chicago a2i q0.9 in
2024 (+6.5%) is the only q0.9 loss in three years. The raw 80% interval coverage of the
boosted quantiles is 0.67 to 0.83 in these years, so the quantile models under-cover
(Austin i2c lowest); that is a calibration gap, not a ranking one.

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

### 4.6 A neural quantile baseline (milestone 27)

An embedding MLP (two hidden layers of 128, three monotone quantile outputs trained on the summed pinball loss, 3 seeds, early stopping on the calibration year; `../src/neural.py`, `../results/neural_*_2024.json`) was run on the five city/target pairs with the same split, features and test year as 4.1. Test pinball relative to the committed boosted models (positive = neural worse):

| pair | q0.1 | q0.5 | q0.9 |
|---|---|---|---|
| Chicago a2i | +0.6% | 0.0% | -3.0% |
| SF a2i | +0.9% | +1.2% | +5.9% |
| SF i2c | +1.8% | +2.6% | +2.9% |
| Austin a2i | +2.5% | +0.1% | +1.6% |
| Austin i2c | -0.2% | +0.3% | -0.1% |

The neural net is within 3% of the boosted model in 14 of 15 cells (the exception is SF a2i q0.9, +5.9%) and ahead only at Chicago q0.9 (where the boosted model is itself worse than the empirical baseline) and in two Austin i2c cells that are ties. It keeps most of the boosted gain over the baseline (for example Austin a2i q0.9: boosted -36%, neural -35%), so the proposal's comparison closes without changing the H1 reading: gradient boosting is not beaten by a small neural net on these tabular fields. Limits: one architecture and learning rate, no tuning, 3 seeds, one test year; the neural quantile outputs are strictly positive, so its own raw 80% interval misses every same-day permit (coverage 0.30 in SF a2i, 0.53 in Chicago a2i) and is not comparable to the boosted interval without rounding; its same-day Brier is slightly worse than the boosted one (the head is trained at weight 0.1 and is not used to stop). Intervals for the pinball differences against the baseline are in the result files. The hypothesis (neural within 3% of boosted at each level) was held in the author's head, not written to the log, before the first run.

### 4.6a The neural comparison over three test years

The same MLP and split were rerun for test years 2022 and 2023 (`LOG.md`, session 38; `../results/neural_*_2022.json`, `*_2023.json`; the table is `../results/neural_vs_boosted_table.md`, made by `python3 src/summarise_neural.py`). Neural pinball relative to boosted, over all 45 city/target/quantile/year cells: within 3% in 43 (14 of 15 in 2022, 15 of 15 in 2023, 14 of 15 in 2024), neural ahead in 18, mean difference +0.22%. The two misses are Austin i2c q0.9 in 2022 (neural 4.3% better) and SF a2i q0.9 in 2024 (neural 5.9% worse). The pre-stated "not better than boosted" half failed in 2022 (neural ahead in 9 of 15), so we read the two families as tied on these fields, not boosting as ahead; the 4.6 sentence that boosting is "not beaten" holds only in that sense. Limits: one untuned architecture, 3 seeds, no bootstrap interval on the neural-minus-boosted difference, and "within 3%" is a convention.

Sign test and cell bootstrap (`../src/neural_sign_test.py`, `../results/neural_sign_test.txt`; descriptive, since cells share data): over all 45 cells the mean difference is +0.22% (95% bootstrap -0.30 to +0.75); in 2022 and 2023 the intervals contain 0; in 2024 the mean is +1.14% (+0.21 to +2.13) with the neural net ahead in 3 of 15 cells (sign p 0.035, uncorrected for the four groupings). The per-permit paired week-block bootstrap (`../src/paired_neural_boosted.py`, `../results/paired_summary_2024.txt`; 2024 only, refit on feeds pulled 2026-11-06) is more specific than the cell view: of 15 cells the neural net is worse in 11, significantly worse (interval excludes 0) in 8, significantly better in 2 (Chicago q0.5 -0.46%, q0.9 -3.30%) and indistinguishable in 5. Losses are concentrated in SF (q0.9 +5.77%; i2c +1.3 to +2.1% at every level) and Austin (a2i q0.1 +2.73%, i2c q0.9 +1.36%), so the near-zero overall mean is Chicago's gain offsetting them, not a uniform tie. Multiplicity (`../src/paired_multiplicity.py`, `../results/paired_multiplicity_2024.txt`): the bootstrap draws were not saved, so an approximate p per cell comes from a normal approximation to its interval (an approximation; skewed intervals would differ). Holm (family-wise 0.05) and Benjamini-Hochberg (FDR 0.05) both keep all 10 cells whose interval excludes 0; the weakest is SF a2i q0.5 (p about 0.006, against a Holm threshold of 0.05/6). So the 8-worse, 2-better split is not a multiple-testing artefact, though the week-block bootstrap itself is untested for dependence beyond weeks. Limits: the first multiplicity check covered 2024 only (2022 and 2023 follow below); one untuned MLP. The pre-stated prediction (at least 10 intervals containing 0, none significantly better) failed on both counts (`LOG.md`, session 42). The same test for 2023 (`../results/paired_summary_2023.txt`, 15 cells, same code, feeds re-pulled 2026-11-06) gives a different split: neural significantly worse in 6, significantly better in 5 (Austin a2i q0.5 -1.86% and q0.9 -3.85%, Chicago a2i q0.1 and q0.9, SF a2i q0.1 -1.97%), indistinguishable in 4. Only SF i2c repeats across years (worse at every level, +1.7 to +2.0% in 2023, +1.3 to +2.1% in 2024). Chicago q0.9 favours neural in both years (-1.27%, -3.30%); the other 2024 SF and Austin deficits do not persist. So the neural-versus-boosted difference is mostly year-specific, with one stable loss (SF i2c) and one stable gain (Chicago q0.9); the pre-stated 2023 prediction held (`LOG.md`, session 44). The same test for 2022 (`../results/paired_summary_2022.txt`, `python3 src/summarise_paired.py 2022`, feeds re-pulled 2026-11-07) gives neural significantly worse in 6 cells, significantly better in 5 and indistinguishable in 4. SF i2c is worse at every quantile in all three years (9 of 9 cells, +0.4 to +2.1%), the only stable loss; Chicago q0.9 favours neural by point estimate in all three years but is significant in two (2022 interval -2.44 to +0.77%). Austin i2c changes sign by quantile in 2022 (q0.1 +2.31%, q0.9 -5.57%). Significantly worse/better by year: 6/5 (2022), 6/5 (2023), 8/2 (2024). The pre-stated 2022 prediction half-failed (worse count 6 against at most 5; Chicago q0.9 not significant; `LOG.md`, session 45). Multiplicity for 2022 and 2023 (`../results/paired_multiplicity_2022.txt`, `_2023.txt`, `_all.txt`; same normal approximation): of the 11 uncorrected significant cells in each year Holm keeps 9 (2022) and 8 (2023), BH keeps 11 and 8; pooled over all 45 cells, 32 are uncorrected-significant, 29 survive BH and 24 survive Holm. So the 2024 result (all 10 survive) is the cleanest; in the other years a few single-cell findings, mostly SF a2i and Austin 2023, are not robust to correction. Pooling treats 45 cells that share data as one family, so the counts are descriptive (`LOG.md`, session 46). For 2024 the normal approximation is replaced by p computed from the bootstrap draws themselves (`../src/paired_neural_boosted.py`, `boot_pvalue`; `../src/paired_boot_table.py`; `../results/paired_boot_p_2024.txt`; two-sided, +1 smoothed, floor 0.001 at 2000 draws): uncorrected 10, Holm 10 and BH 10 of 15, the same cells as the normal approximation, with SF a2i q0.5 the closest to the line (p 0.006). The pre-stated prediction held (`LOG.md`, session 47). The normal approximation's very small p values (down to 1e-131) were not literal; the bootstrap cannot go below 0.001. 2022 and 2023 still use the normal approximation, and the percentile-bootstrap sign p is not studentised.

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

### 4.4a The harmonised class barely overlaps between cities (diagnostic, no new model run)

The one categorical feature a transfer model shares across cities is the keyword-harmonised
class. Its test-year shares, stored in every `../results/transfer_*.json`, show the cities
fall into almost disjoint classes (`../src/class_overlap.py`, `../results/class_overlap_2024.md`):
SF is 97 to 98% "alteration", Austin is electrical, plumbing and mechanical plus 21 to 22%
"other", Chicago is 69% "other" and Seattle 91% "other" with the rest "demolition". The
overlap coefficient between a held-out city and its row-weighted source mix (source shares
taken from the same test year, a proxy for the training years) is 0.00 to 0.34, and 0.00 to
0.19 once the catch-all "other" is dropped (0.00 or 0.01 in five of seven city/target cells;
i2c Austin and SF share no class at all). So in H4 the class feature cannot carry permit-type
knowledge from one city to another; the transfer model is in effect a model of log cost,
description length and calendar, and its "class" for a new city says which source city's
catch-all the permit resembles. This narrows what 4.4 and 4.8 can claim: they test whether
those four generic fields transfer, not whether permit types do. A class map retuned on each
feed's real vocabulary is the test that would separate the two (to do 6); `src/transfer.py`
also stores the source training shares; for Seattle 2022 they give an overlap of 0.27 (a2i) and
0.20 (i2c), and 0.006 and 0.00 without "other" (session 69), close to the test-year proxy.

Why the catch-all is so large (session 69, `../src/other_vocab.py`, `../results/other_vocab.md`):
each feed has only 4 to 9 raw permit types, and in two cities the field does not name the kind
of work. Chicago's permit types are review tracks ("express permit program" 40.5% of rows since
2015, "easy permit process" 22.9%), and Seattle's is "building" for 90.1% of rows. The work-class
field rescues only Austin, whose "building permit" rows carry new, repair, remodel or demolition
(the same keyword map would class 25.4% of Austin's rows from it); Chicago's work class repeats the
review track and Seattle's is residential or non-residential. So a map retuned on structured fields
cannot give Chicago or Seattle a work type: that needs the description text, which the loader
keeps only as a length.

### 4.4b Do the description rules agree with a reader? (session 71, hand labels)

The cascade in to do 6 needs a work type from the description, so its keyword rules were scored
against hand labels (`../src/desc_eval.py`, `../results/desc_rules_eval.json`). Samples hold
applications whose permit type and work class both fall to "other" in Chicago and Seattle, the
rows the description must rescue. One labeller (the agent running the session) labelled from the
text alone, by a written protocol, without the rules' output. On a 2023 development sample
(200 rows per city) the pre-registered rules (session 70) agreed with the labels on 56.0% of
Chicago rows and 77.0% of Seattle rows. The errors had clear patterns: "erect" sent solar arrays
and fences to new construction, electrical service and panel work had no rule, and Seattle's
"construct west two-family dwelling" lacks the word "new". Revised rules written against those
errors were then scored on a 2022 held-out sample (150 rows per city, labelled before either rule
set ran on it): 85.3% (95% Wilson interval 78.8 to 90.1) in Chicago and 95.3% (90.7 to 97.7) in
Seattle, against 60.0% and 78.0% for the original rules (exact McNemar p 4e-10 and 2e-7; 2 and
1 rows where only the original was right, 40 and 27 where only the revision was). A single
labeller and a non-uniform draw within each year limit these numbers; they show the original
rules were too noisy to test whether a work type transfers, and the revised rules are usable.

With a work type, H4 for Seattle (2024 test, 3 seeds, `../results/transfer_seattle_*_2024_4city_cascade*.json`)
changes where the class matters. The class overlap between Seattle and its sources' training years,
without "other", rises from 0.006 to 0.50. For application-to-issue the q0.9 transfer penalty is
+27.4% with the permit-type class, +41.7% with the noisy original rules, and +15.9% (CI still
above zero) with the revised rules, whose interval covers 0.755 against 0.644. Issue-to-completion
q0.1 and q0.5 stay about 10 to 11% better than the baseline in every configuration, and q0.9 stays
within noise of it. So part of the upper-tail transfer gap was a class problem, and a noisy class
did more harm than none. One test year and one held-out city so far; the three configurations are
compared with the baseline only; the paired comparison follows.

A paired week-block bootstrap of the revised-rule class against the permit-type class on the same
test rows (`../results/paired_transfer_seattle_*_2024_4city_cascade2_vs_type.json`, session 74;
predictions written in session 73) puts an interval on the difference itself. For application-to-issue
the work type lowers the transfer model's q0.9 loss by 3.9 days (95% interval 2.8 to 4.9; 11.5% of
the baseline's loss) and helps a little at q0.5 (0.5 days). For issue-to-completion it helps at q0.1
and q0.5 (0.7 and 0.8 days) but costs 2.2 days at q0.9 (interval 0.9 to 3.5; 4.7%), which the unpaired
comparison could not detect. The own-city model gains in all six target-quantile cells (0.4 to 2.1
days), so the class carries signal inside Seattle; across cities it helps everywhere except the upper
tail of build time. One test year; the 2023 repeat was not run.

Agreement beyond chance (Cohen's kappa, `python3 ../src/desc_eval.py kappa`) is 0.79 in Chicago and
0.90 in Seattle on the held-out year for the revised rules, against 0.47 and 0.58 for the original.

Rule error does not move that overlap (`../src/desc_confusion.py`, `../results/desc_confusion.md`).
Correcting Seattle's test mix with the held-out P(label | prediction) leaves it at 0.501, because
the overlap is source-limited: Seattle's alteration, new-construction and demolition shares all
exceed the sources', so each term takes the source share. Shifting the source mix by Chicago's
held-out error (Chicago is at most 21% of the a2i pool) gives 0.508 (bootstrap 0.500 to 0.518). What
caps the overlap is the trades: electrical, plumbing and mechanical are 45% of the sources' training
rows and 0.3% of Seattle's test rows. Per class, the revised rules' weakest large class is Chicago
alteration (recall 0.74, 95% Wilson 0.57 to 0.85); Seattle new-construction recall is 0.93 (0.81 to 0.98).

### 4.5 Pooled model plus a small local sample (H5 holds; secondary refuted)

Five draws of the local rows, source rows capped at 100,000 per city, a2i only.
The first n at which the pooled model (local weight 20) is at or below the city's
full-history baseline: Austin 300; Chicago and SF not within 3000. At n = 3000:
Chicago +14.1%, SF +5.9%, Austin -8.8%. The pooled model beat a baseline built from
the same n local rows in 8 of 24 pair/n/weight cells (6 in Austin). In Austin a
boosted model on the local rows alone is as good or better than pooling at every n.

Bootstrap p for all three years (session 49; `../src/paired_boot_table.py`, `../results/paired_boot_p_{2022,2023,2024,all}.txt`). The paired runs for 2022 and 2023 were refit on feeds pulled 2026-11-07 (3 seeds, same code), now carrying a week-block bootstrap p (2000 draws, floor 0.001). Because the refit changes the point estimates slightly, the counts differ a little from the earlier paragraphs: 2022 has neural significantly worse in 5, better in 5, indistinguishable in 5; 2023 has worse in 7, better in 6, indistinguishable in 2. With the bootstrap p, the uncorrected counts are 10 (2022), 13 (2023) and 10 (2024) of 15 per year; Holm(boot) keeps 8 (2022), 9 (2023) and 10 (2024), and pooled over the 45 cells 33 are uncorrected-significant, 22 survive Holm and 31 survive Benjamini-Hochberg (the normal approximation on the same files gives 33, 24 and 29). The single-cell findings that fail Holm are mostly 2022 and 2023 SF a2i and Austin i2c cells, and SF a2i q0.5 in 2024; SF i2c remains the stable loss. Limits: percentile-bootstrap sign p, not studentised; the 45 cells share data, so the counts remain descriptive; the refit moved some cells across the zero line, so single-cell significance in 2022 and 2023 is not stable under reseeding or re-pull.

### 4.7 The published permit-duration prior (milestone 7)

The descriptive reference class behind the baseline is published as a data file for downstream tools (`../results/permit_prior.json`, `../results/permit_prior_table.md`; `python3 src/prior.py DIR --years 2022 2023 2024`, `python3 src/summarise_prior.py`; `../LOG.md`, sessions 34 and 35). It holds, per city, target and permit type, the type-7 q10/q50/q90 and the same-day share over 2022 to 2024 (start year is the application date for a2i, the issue date for i2c); types under 30 rows are folded into the all-types row, not dropped.

| city | target | n | same-day | q10 / q50 / q90 (days) | types kept | rows folded |
|---|---|---|---|---|---|---|
| Chicago | a2i | 106,195 | 48.0% | 0 / 1 / 68 | 9 | 0 |
| San Francisco | a2i | 69,869 | 52.4% | 0 / 0 / 95 | 7 | 10 |
| San Francisco | i2c | 55,307 | 0.1% | 14 / 119 / 481 | 6 | 32 |
| Austin | a2i | 172,780 | 4.8% | 1 / 25 / 320 | 5 | 0 |
| Austin | i2c | 163,246 | 0.4% | 7 / 111 / 467 | 5 | 0 |

The spread across permit types is as large as the spread across cities: the per-type median application-to-issue lag runs 0 to 24 days in Chicago, 0 to 533 in San Francisco and 15 to 182 in Austin, so a city-level number alone is a poor prior. The two pre-registered hypotheses (LOG sessions 34 and 35) held: Chicago and SF median application-to-issue is 0 or 1 day, Austin same-day share is 4.8% (below 20%), and the Austin and SF issue-to-completion medians are 111 and 119 days (above 60 and 90). Limits: descriptive quantiles with no model; Chicago is issued-only, so its application-to-issue lags are survivorship-biased; a three-year window; the model-based (boosted) version is not published.

### 4.7a Can the boosted model be flattened to a table? (H6 refuted)

To ship the boosted gain to `ventures/` without a model file, each cell of permit type x cost bucket (unknown, <1k, 1k-10k, 10k-100k, 100k-1M, >=1M dollars) took the median of the model's q10/q50/q90 predictions over the calibration year (`../src/prior_boosted.py`, `../results/prior_boosted_eval_2024.json`; `../LOG.md`, session 50). Pre-registered: the table keeps at least half of the full model's pinball gain over the per-type baseline in at least 4 of 5 city/target sets. It did in one (SF a2i, 0.83); the others were 0.04 (Chicago a2i), -0.03 (SF i2c), -0.03 (Austin a2i) and -0.10 (Austin i2c). At q0.9 the cell median of predictions sits above the cell's own q90 in Austin (pinball 42.6 against 37.1 baseline and 23.6 for the full model). An empirical type x bucket lookup was no safer (Chicago q0.9 16.4 against 11.1). So the boosted prior is not published as a table; the gain lives in features a type x cost grid drops. Limits: one flattening rule, 2 seeds, test year 2024.

### 4.7b Which dimensions would a table need? (H8 held)

Nested refits of the same quantile model on feature subsets (`../src/prior_ladder.py`, `../results/prior_ladder_2024.json`; `../LOG.md`, session 52) give the share of the full model's mean pinball gain kept. Pre-registered: type + cost + work class keeps at least half in at least 3 of 5 sets, type alone under a quarter in at least 3. Both held, in 5 of 5: type alone keeps -0.28 to 0.16, type + cost 0.11 to 0.87, adding work class 0.59 to 0.87, adding description length 0.89 to 0.99. The 4.7a table omitted work class. Limits: models on continuous cost, not tables; one feature order; test year 2024; 2 seeds; the secondary prediction (description length the biggest step in Austin a2i) failed, work class was.

### 4.7c Table flattening, continued: a refit, a three-key table and its interval (H7 refuted, H9 post hoc, H10 refuted)

Three further attempts to turn the boosted gain into something readable (`../LOG.md`, sessions 51, 53 and 54; `../results/prior_refit_eval_2024.json`, `../results/prior_table3_2024.json`, `../results/prior_table3_cov_2024.json`; all test year 2024, 2 seeds). Shares below are the fraction of the full model's mean pinball gain over the per-type baseline (mean over q0.1, q0.5, q0.9) that a prior keeps.

- **Key-only refit (H7, pre-registered, refuted).** A quantile model whose only inputs are permit type and cost bucket keeps 0.16 (Chicago a2i), 0.63 (SF a2i) and 0.42 (SF i2c) of the gain; Austin's host was unreachable that session. Prediction: at least 50% in 2 of 3 sets. It held in one. It beats the empirical type x bucket lookup in all three sets, by under 1.5%, which is not evidence of smoothing beyond noise.
- **Type x work class x cost-bucket table (H9, *post hoc*).** The hypothesis was not written into the log before the run; the 50% threshold is session 52's, applied afterwards. Shares (Chicago a2i / SF a2i / SF i2c / Austin a2i / Austin i2c): 0.80 / 0.59 / 0.35 / 0.67 / 0.87. The threshold is met in 4 of 5 sets. San Francisco's feed has no work class, so its three-key table equals the two-key one. Chicago's 0.80 is the median only (the full model has no gain over the baseline at q0.1 and q0.9 there). Austin's table has about 195 cells, so it is a lookup, not a short chart.
- **Does the table's 80% interval hold (H10, pre-registered, refuted)?** Split-conformal (CQR) on the 2023 calibration year, coverage on 2024 (Chicago a2i / SF a2i / SF i2c / Austin a2i / Austin i2c): table 0.832 / 0.834 / 0.842 / 0.839 / 0.842; per-type baseline 0.885 / 0.826 / 0.857 / 0.823 / 0.845; full model 0.862 / 0.891 / 0.833 / 0.813 / 0.811. The 77 to 83% band holds in none of five sets for the table: all over-cover, by 3.2 to 4.2 points. Mean widths in days (table / full model): 118 / 67 Chicago a2i, 41 / 62 SF a2i, 400 / 404 SF i2c, 161 / 170 Austin a2i, 290 / 290 Austin i2c, so the table is within 1.25x the full model's width in four sets and 1.76x in Chicago. For Chicago the per-type baseline's interval (55 days wide) is the better one to ship.

A dequantised variant (jitter on tied scores, from 4.2a) did not repair this: it gave 0.825, 0.834, 0.837, 0.765 and 0.836 for the table, and for the *full* model it collapsed to 0.558 (Chicago a2i) and 0.343 (SF a2i) against 0.862 and 0.891 plain. A post hoc diagnosis from the saved results (`../src/dequant_diag.py`, `../results/dequant_diag.txt`, session 55) found the collapse in exactly the four of fifteen model cells where the conformal correction came out negative (-0.09 to -0.33 days). The mechanism proposed is that a negative correction raises the lower end and lowers the upper end of a same-day row's interval, which sits at [0, 0], so the interval becomes empty and covers nothing. This is consistent with the table but confirmed by the rerun in 4.7d. A guarded interval that never lets the upper end fall below the lower (`conformal.cqr_interval_nonempty`, unit tested) exists and is wired into the coverage run (session 56), and its rerun is reported in 4.7d (pre-registered check: coverage within 3 points of 80% in at least 4 of 5 sets and no cell more than 1 point below its raw interval; refuted in part).

Reading: a type x work class x cost table is a usable median prior in four of five sets and its interval is conservative rather than tight. The shipped prior stays the empirical per-type table (4.7), and no boosted table is published. Limits: one test year, 2 seeds, one bucket scheme, no intervals on the shares, no bootstrap on coverage (binomial error under 0.5 points at these n), and the table was built on train-only rows for H10 but train plus calibration rows for H9.

### 4.7d Coverage after the nonempty fix (session 58, 2026-11-09)

Re-running the conformal coverage experiment of 4.7c on fresh pulls with `cqr_interval_nonempty` removes the collapse: the full model's dequantised coverage goes from 0.558 to 0.861 (Chicago a2i) and from 0.343 to 0.890 (SF a2i), and the table's Austin a2i coverage from 0.765 to 0.825. The prediction that at least 4 of 5 sets fall within 77 to 83% was refuted (table 2 of 5, full model 3 of 5; the rest over-cover), as was the bound of 1 point below raw coverage (worst cell 1.4 points). Numbers are in `results/prior_table3_cov_2024.json` and `LOG.md`, session 58.

### 4.7e Which interval to ship (session 59, post hoc rule)

The rule was written after the numbers in 4.7c and 4.7d were seen, so it is a decision, not a test (`../src/ship_decision.py`, `../results/ship_decision_2024.json`, unit tested). Among the per-type baseline, the three-key table and the full LightGBM model, each with the dequantised nonempty interval, ship the narrowest whose 2024 coverage is at least 0.77; widths within 1% tie and go to the more readable model. Result (coverage / mean width in days):

| set | shipped | coverage | width | table | full model |
|---|---|---|---|---|---|
| Chicago a2i | per-type baseline | 0.885 | 55.3 | 117.9 | 66.9 |
| SF a2i | per-type baseline | 0.826 | 32.6 | 42.2 | 61.6 |
| SF i2c | per-type baseline | 0.844 | 373.5 | 398.8 | 403.5 |
| Austin a2i | per-type baseline | 0.823 | 156.1 | 160.6 | 169.8 |
| Austin i2c | table (ties full model) | 0.836 | 289.6 | 289.6 | 289.5 |

The per-type baseline interval is the narrowest in four of five sets, so the empirical table of 4.7 is already the right thing to publish for the interval, and neither the boosted model nor the flattened table improves on it there. Only Austin i2c shows no gap between the three. The boosted model's gain (4.1) is in the pinball loss at the quantiles, not in a tighter calibrated interval. This is one test year and two seeds with no bootstrap on width; the baseline's interval is wider than 80% in practice (coverage 0.82 to 0.89), so it is safe but not tight.

### 4.7f Width intervals for the ship decision (session 60)

A week-block bootstrap (2000 draws, `../src/width_boot.py`, `../results/width_boot_2024.json`) of the paired width difference, table minus per-type baseline, with the dequantised nonempty interval: Chicago a2i +62.6 days [55.3, 70.6], SF a2i +9.6 [9.0, 10.2], SF i2c +25.2 [23.1, 27.6], Austin a2i +4.6 [0.2, 9.3], Austin i2c -34.5 [-36.9, -32.1]. All five intervals exclude zero and agree in sign with the ship choice of 4.7e; Austin a2i is a near-tie. The bootstrap resamples test weeks only; the calibration quantile is held fixed, and there is one test year.

### 4.8 A fourth city, Seattle (sessions 61 to 65, 2026-11-09 and 2026-11-10)

Seattle's "Building Permits" feed (`76t5-zqzr`, 194,184 rows pulled 2026-11-10) states "Public Domain" in its metadata (`../datasheets/seattle.md`), so it was added after the licence check that section 5 listed as open. Like Chicago it is survivorship-biased (permits that were never issued are largely absent). Everything below is the same code as for the other cities, 2024 test year unless stated; the class map was not retuned. Sessions 61 and 64 wrote no prediction before the run, so those parts are descriptive; sessions 62, 63 and 65 are in `../LOG.md` with the prediction first.

- **H1 holds in Seattle** (`../results/boosted_seattle_*_2024.json`): the boosted model beats the per-type baseline at q0.1, q0.5 and q0.9 in both targets, every 95% week-block interval below zero (a2i q0.5 46.5 to 35.8 days; i2c q0.5 88.3 to 72.5; smallest gain i2c q0.9, 47.1 to 46.0). That makes 19 of 21 city/target/quantile cells, with Chicago a2i q0.1 and q0.9 the only losses in the original three cities.
- **Coverage and the ship rule** (`../results/prior_table3_cov_2024_seattle.json`, nonempty dequantised CQR, nominal 80%): baseline 0.887 (a2i) and 0.851 (i2c), table 0.833 and 0.820, full model 0.845 and 0.821. The 77 to 83% band holds in three of six cells; the other three over-cover. Seattle is the first city where the ship rule of 4.7e picks the full model rather than the per-type baseline: it is narrowest in both targets (232.3 and 606.8 days, 7 to 9% under the baseline). The week-block bootstrap of 4.7f (`../results/width_boot_2024_seattle.json`) gives the three-key table minus baseline as -7.4 days [-13.3, -1.1] (a2i) and -18.3 [-23.4, -12.9] (i2c), so unlike the other cities the table is narrower than the baseline in both targets. The full-model width was not bootstrapped.
- **H4 (transfer) is refuted for Seattle i2c in 2024** (`../results/transfer_seattle_{a2i,i2c}_2024_4city.json`; sources Chicago, SF and Austin for a2i, SF and Austin for i2c, since Chicago has no i2c). Relative change of mean pinball loss against Seattle's own per-type baseline: a2i 0.0% (q0.1), +0.7% (q0.5, interval spans 0), +27.4% (q0.9, worse); i2c -8.6%, -10.7%, -5.1%, all intervals below zero. This is the first held-out cell where a model trained on other cities beat the held-out city's own baseline at all three quantiles. The transfer intervals still under-cover (80% coverage 0.644 a2i, 0.720 i2c, against baselines at 0.890 and 0.882).
- **Second test year, 2023** (session 65, prediction written first; `../results/transfer_seattle_{a2i,i2c}_2023_4city.json`): the a2i row reproduces 2024 (q0.1 -0.1%, q0.5 +0.5% with the interval spanning 0, q0.9 +27.1%, coverage 0.613). The i2c gain holds at q0.1 (-6.7%) and q0.5 (-7.3%) but q0.9 flips to +11.2% (worse; 2024: -5.1%), coverage 0.681. So "transfer beats the city's own baseline at every quantile" was a 2024 result; the part that held in both years is the lower and middle quantiles. The q0.9 flip is unexplained (an untested guess is that Seattle's 2023 upper tail differs from the SF and Austin tails). An own-city model on the same harmonised features beats the baseline at all three quantiles in both years (2023 i2c -8.9, -12.5, -3.4%), so what costs the transfer model its edge is the move between cities rather than the feature set.
- **Third test year, 2022** (session 69, prediction written in session 68 before the run; `../results/transfer_seattle_{a2i,i2c}_2022_4city.json`; train to 2020, early stopping on 2021): all three predicted parts held. a2i: -0.1% (q0.1), +0.1% (q0.5, interval spans 0), +35.8% (q0.9, worse), coverage 0.547 against the baseline's 0.821. i2c: -11.4%, -4.2%, +14.1% (q0.9 worse), coverage 0.672 against 0.814. Over 2022 to 2024 the stable pattern is: i2c better at q0.1 and q0.5 in all three years, a2i worse at q0.9 in all three (+27 to +36%), every transfer interval under-covering (0.547 to 0.720). The i2c upper quantile is worse in two of three years, so the 2024 all-quantile gain is the outlier. The own-city model again beats the baseline at every quantile (2022 i2c -12.8, -14.4, -8.2%).

Limits: three test years for transfer and one for the rest, 3 seeds (2 for coverage), i2c has two source cities, Seattle's baseline is trained on a smaller history than the other cities', `baselines.py` (XGBoost) and CatBoost were not run for Seattle, and the ship rule is post hoc. H4 as worded in the abstract (13 of 15 cells worse) describes the three original cities and is not changed by Seattle.

## 5 Limitations

One test year (2024) for H3, H4, H5 in the original three cities (H1 and the neural comparison also run for 2022 and 2023; Seattle transfer for 2022 to 2024); three seeds (two for conformal); one fixed
configuration per library (defaults, untuned); the neural net (4.6) is one untuned architecture; the
structured class map is a keyword rule not validated against hand labels (the description rules are, 4.4b: 85% and 95% held-out agreement with one labeller), and its classes barely overlap between cities (4.4a), so the transfer results test the generic fields only; Chicago
is survivorship-biased and has no i2c; "completed" is a status date; the spread over
draws in 4.5 is not reported; i2c is not rerun for H5b; a fourth city (Seattle, 4.8) with partial coverage of the experiments (NYC DOB NOW
licence unchecked). Drift years 2022 and 2023 exist only for conformal coverage; 4.2a uses 2024 only and does not run Austin or i2c for H2d and H2e.

## 6 What a practitioner can take

For a new city, start with the per-type empirical quantile of its own recent
permits; a few hundred rows already come close to the full-history version. Do not
rely on a model trained elsewhere, and do not trust the nominal coverage of a
conformal interval where a large share of lags are exactly zero: check the same-day share first;
tighter quantile levels (4.2a) can halve the width, but pick them with drift in mind.

## 7 To do before submission

1. Tune the neural net and libraries; per-library tuning (Austin a2i CatBoost gap).
2. A year-ahead (Y-2 versus Y-1) calibration check for the quantile pair (4.2b did not solve Chicago); (H2g now run for every city and target that has one; see 4.2c).
3. Spread over draws and i2c for 4.5; first-n-rows ordering instead of random draws.
4. A fourth city after a licence check: Seattle added in 4.8 (public domain; H1, coverage, width and H4 transfer for 2022 to 2024); NYC DOB NOW is still unchecked. (H1 now runs over test years 2022 to 2024, see 4.1a); the per-permit paired bootstrap on neural minus boosted now covers 2022, 2023 and 2024 (4.6a).
5. Empirical permit-duration prior published for all three cities (4.7); a median-of-predictions table of the boosted model failed to keep its gain (4.7a); a model-based version for `ventures/` is still to do: three flattening routes (4.7a, 4.7c) keep the gain only partly, the guarded-interval rerun (4.7d) repaired the collapse, and 4.7e picks the shipped interval (per-type baseline in four of five sets).
6. Build a work-type class from the description text for Chicago and Seattle (4.4a: their structured fields do not name the work; overlap without "other" is 0.00 to 0.19) and from `work_class` for Austin, validate it on a hand-labelled sample, and rerun H4. Code in place (session 70: `src/classmap.py` cascade, the loader's `desc_class`, `transfer.py --classes cascade`, with a prediction in `../LOG.md`). Validated in session 71 (4.4b): the session 70 rules agree with hand labels on 60% (Chicago) and 78% (Seattle) of held-out rows, the revised rules (`desc_class_v2`, `--classes cascade2`) on 85% and 95%.
7. Re-run `research/_shared/cite_check.py` at submission and re-check novelty.
