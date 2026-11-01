# build-data log

## Session 12, 2026-11-01: milestone 8, five draws of the local sample (H5 re-test), hypothesis written before the run

Why: M7 used one effective draw per n (seeds only partly averaged, no interval over the draw), and called differences of 1 to 2% noise. Hypothesis (H5b): with 5 independent draws of the n local rows, the M7 headline survives: the first n at which pooled (w=20) is at or below the full-history per-type baseline (grid 100, 300, 1000, 3000) is above 1000 in at least 3 of 4 a2i cities-pairs (Austin, Chicago, SF; so at least 2 of 3 here; i2c follows if time allows). Refuted if it is 1000 or less in 2 of 3. Prior 60%. Secondary: the pooled model beats base_n (same n rows) in fewer than half of the pair/n cells (M7: 6 of 15). Prior 70%.
Changes against M7, stated up front: 5 seeds not 2; source rows capped at 100,000 per city (not 200,000) for the 4-core budget, so a shift from M7 may come from the cap; grid trimmed to 100 to 3000; `src/pooled.py` gains `--grid` and `--tag` (results `pooled_m8_*`). Feeds re-pulled today (Chicago 851,889 rows, SF 1,297,749, Austin 2,383,195).

## Session 11, 2026-11-01: milestone 7, pooled model plus a small local sample (H5), hypothesis written before the run

Hypothesis (H5): a model pooled with the other cities and given n rows of the held-out city's own history matches that city's full-history per-type baseline (mean pinball over q0.1/0.5/0.9, test year 2024) only once n is in the thousands: the first n in the grid (0, 100, 300, 1000, 3000, 10000) at which the pooled point estimate is at or below the full baseline is above 1000 in at least 3 of 5 city/target pairs. Refuted if it is 1000 or less in 4 or more pairs. Prior 55% that it holds (M6 showed the cost of moving between cities is large, +2 to +137%, but the per-type baseline also needs data to fill its classes). Secondary, also written now: at every n from 100 to 1000, the pooled model (weight 1 or 20) beats the baseline built from the same n rows (base_n) in most pairs; prior 80%.
Plan: `src/pooled.py`; local rows drawn at random from the held-out city's years <= 2022; early stopping on the other cities' 2023 plus 20% of the local sample (the held-out city's 2023 is never used); 2 seeds (they change the draw and the model); paired week-block bootstrap against the full baseline and against base_n.

Outcome (test year 2024; `results/pooled_*_2024.json`, table `results/m7_table.md`; mean of the three pinball losses; 1 seed; at most 200,000 random rows per source city for speed): **H5 holds, on its main claim**. The first n at which pooled (w=1) is at or below the city's full-history per-type baseline is 1000 (Austin a2i), 1000 (Austin i2c), 10000 (SF i2c) and never in the grid (Chicago a2i, SF a2i): above 1000 in 3 of 5 pairs. With local weight 20 it is above 1000 in 4 of 5. n = 0 (plain transfer) is +36% and +64% in Austin, +107% in Chicago, +9% and +2% in SF, so M6 is reproduced under the cap.
**The secondary claim is refuted.** I expected the pooled model to beat the baseline built from the same n local rows at n = 100, 300, 1000 in most pairs (prior 80%). It does in 3 of 15 pair/n cells at w=1 and 6 of 15 at w=20. A per-type empirical quantile from 300 rows of the city's own data is already within 0 to 8% of the full-history baseline in four pairs (Austin i2c, Chicago, SF both), and the pooled model rarely beats it. Only in Austin a2i does pooling help at small n (n=1000: w20 -5%, vs base_n +2%).
Unplanned finding: a boosted model on the n local rows alone (local_n) is as good as or better than pooling in Austin a2i (-8% vs full at n=1000, significant) and Chicago (-1% at n=1000, the only cell where anything beats Chicago's full baseline), so for the cities where a boosted model helps at all, a small local sample did what the other cities' millions of rows did not. Weight 20 beats weight 1 at small n in Chicago and Austin, and loses in SF i2c; no setting is best everywhere.
Limits: one test year, 1 seed (so the random draw of the local rows is not averaged; differences of 1 to 2% between cells are within noise: stars mark the bootstrap over test weeks only, not over draws); source rows capped at 200,000 per city (M6 used all rows); local rows drawn at random from the city's history rather than the first n a new city would have, so drift is understated; w and the city feature were fixed in advance, not tuned; harmonised class map still not hand-validated; i2c has one source city.
Next: repeat with 5 draws of the local sample to put an interval on the n-curve, the "first n local rows" ordering, and a fourth city (licence check) before the paper (milestone 8).

## Session 10, 2026-11-01: milestone 6, cross-city transfer (H4), hypothesis written before the run

Hypothesis (H4, from the proposal): a model trained on the other cities and tested on the held-out city is no better than that city's own reference-class baseline on 2024 mean pinball loss (q0.1, 0.5, 0.9). Refuted for a city if the paired week-block bootstrap interval of (transfer minus own baseline) lies below zero at two of three quantiles. Prior 35% that H4 holds: the baseline uses the city's own permit types, which carry most of the signal (session 9), while a transfer model only sees a keyword-harmonised class, cost, description length, month and weekday.
Plan: `src/transfer.py`; leave one city out (a2i: three held-out cities; i2c: Austin and SF, Chicago has no completion date, so each is trained on one source city); compare with an own-city boosted model on the same harmonised features as the ceiling; 3 seeds. Feeds re-pulled today. The harmonised class map is a keyword rule written once, before seeing results, and not tuned on the test year.

Outcome (test year 2024; `results/transfer_*_2024.json`, relative change of mean pinball loss against the held-out city's own baseline, week-block bootstrap intervals): **H4 holds in every city and target**. The transfer model is worse than the own baseline with the interval above zero in 13 of 15 city/target/quantile cells: Chicago a2i +16, +38, +84% (q0.1, 0.5, 0.9); SF a2i +2.1, +14.7, +3.8%; Austin a2i about 0, +0.0, +62.5%; Austin i2c +66, +137, +79%. Two cells are not worse: Austin a2i q0.1 (a tie, both predict about zero) and SF i2c q0.1 (-2.8%, the only cell where transfer wins; it loses at q0.5 +2.0% and q0.9 +3.0%). H4 would be refuted by two quantiles in one city, so it is not. Coverage of the transfer 80% interval: 0.63 and 0.61 in Austin (a2i and i2c), 0.85 Chicago a2i, 0.92 SF a2i, 0.78 SF i2c.
Control, so the loss is not just the thin harmonised features: an own-city model on the same harmonised features beats the baseline in Austin (a2i -13% median, -20% at q0.9; i2c -4.5%) and SF i2c, and is within a few percent in Chicago and SF a2i. So the cost is moving between cities, not the feature set.
Limits: one test year, 3 seeds; the harmonised class is a keyword map written once and not validated against a hand-labelled sample; i2c transfer has a single source city (Chicago has no completion date), so it is weaker evidence than a2i; no pooled-plus-local model (train on all cities and fine-tune on a little local data), which is the likelier practical route and is the next step; Austin a2i q0.1 and q0.5 differences sit at zero because most predictions are zero. A fourth city and its licence check are still to do.
Next: pooled model with a small local sample (learning curve in local rows), then the paper (milestone 7).

## Session 9, 2026-10-31: milestone 5, permutation importance and drop-one ablation (H3 holds, as worded)

Hypothesis (H3, from the proposal, before the run): at most five fields account for 80% of the importance. Operationalised before running: importance is the rise in mean pinball loss (q0.1, 0.5, 0.9) of the session-6 models when one test-row column is shuffled (3 repeats, 3 seeds); k80 is the smallest number of fields whose positive importances reach 80% of their sum. Refuted if k80 > 5 in any pair. Prior 70% that it holds. Caveat noted in advance: the models have only 7 fields (6 in SF, which has no work class), so k80 <= 5 is a weak test.
Done: `src/importance.py`; refreshed the three feeds into a scratch directory; results in `results/importance_*_2024.json`, table in `results/m5_table.md`. Drop-one refits use the first seed only (cost).
Outcome: **H3 holds on all five pairs (k80 = 2 to 4)**, but the wording is looser than the data. The top field carries 39 to 70% of the importance: work class in Austin (68% a2i, 65% i2c) and Chicago (39%), permit type in SF a2i (70%), log cost in SF i2c (66%). Month and weekday are near zero everywhere. Drop-one agrees on the top field in four of five pairs; in Chicago a2i it picks description length (+1.16 days) while permutation picks work class, a sign of correlated fields (drop-one lets the others stand in, permutation does not) and of a one-seed refit.
Not what H3 says: H3 speaks of the gain over the baseline, and permutation importance is not a decomposition of it. The importances sum to 1.7 to 3.4 times the gain in four pairs and 20 times in Chicago a2i, where the gain is only 0.17 days: the model leans on fields heavily and still barely beats a per-type baseline. So "five fields explain 80% of the gain" is not shown; "five fields carry 80% of the model's reliance" is.
Limits: one test year, 3 seeds, 3 permutation repeats, importance not given intervals, no grouped permutation of correlated fields, drop-one has one seed. Hypothesis wording should be tightened (state k80 on permutation importance, or run a Shapley decomposition of the gain) before the paper.
Next: milestone 6 (cross-city transfer, H4; licence check for a fourth city), and a grouped-permutation or Shapley variant of H3.

## Session 8, 2026-10-31: milestone 4 run, split-conformal on the real feeds (H2 refuted)

Hypothesis (H2, written in session 7 before any run): split-conformal intervals calibrated on the year before the test year cover within 3 points of 80% on the test year in every city; refuted if coverage is outside 77 to 83% in any city. Prior 60% that it holds (I expected it to fail in Chicago and SF a2i).
Done: `src/conformal_run.py` (fit on years <= Y-2, early-stop on odd ISO weeks of Y-1, conformalise on even weeks of Y-1, test on Y; q0.1/q0.9 LightGBM ends; 2 seeds; coverage CI by week-block bootstrap), run on 7 city/target pairs x test years 2022, 2023, 2024 (Chicago has no completion date). Feeds pulled fresh today (hosts reachable this session). Results: `results/conformal_*.json`.
Outcome (test year 2024, the headline year):
- Conformal coverage: Austin a2i 0.816, Austin i2c 0.813 (both within 3 points); Chicago a2i 0.860 [0.852, 0.867]; SF a2i 0.891 [0.881, 0.899]; SF i2c 0.834 [0.827, 0.840]. **H2 is refuted**: three of five pairs are outside 77 to 83%.
- Across all 15 city/target/year cells: 7 of the 15 cells are within 3 points (Austin a2i 2022, 2024; Austin i2c 2022, 2024; Chicago a2i 2023; SF i2c 2022, 2023).
- Mechanism for a2i: in Chicago and SF (and Austin 2024) qhat is exactly 0.00 and conformal equals raw. The raw interval over-covers on the calibration weeks, and because many permits are same-day (y = 0 with lower end 0) the CQR scores tie at 0, so the finite-sample quantile cannot go negative and cannot narrow the interval. The method is conservative here by construction, not by luck. SF a2i 2024 stays at 0.891.
- Where the raw interval under-covers (i2c, and Austin/SF a2i in 2022 or 2023) conformal widens it by 3.5 to 22 days and lifts coverage by 4 to 11 points, usually to 0.80 to 0.86. It does not always reach 80%: Austin a2i 2022 0.780 and Austin i2c 2022 0.787, the cases where the calibration year (2021, early pandemic) differs most from the test year.
- Drift diagnostic: the two-sample KS statistic of calibration vs test scores is small (0.02 to 0.07) except Chicago a2i 2024 (0.246), where coverage moved from 0.81 (2023) to 0.86 (2024).
Limitations: 2 seeds; one split rule; intervals are marginal, not conditional on permit type; CQR with a clipped lower end cannot narrow. A fix to try: score the two-part (same-day indicator, then tail) model, or use a randomised tie-break, so the same-day mass does not pin qhat at 0.
Next: milestone 5 (importance and ablations, H3), and a two-part conformal variant for a2i.

## Session 7, 2026-10-31: milestone 4 instrument (split-conformal, drift diagnostic); not run on real data

Hypothesis (H2, unchanged, written before any run): split-conformal intervals calibrated on the year before the test year cover within 3 points of 80% on the test year in every city; refuted if coverage is outside 77 to 83% in any city. Given session 5 (baseline coverage 0.75 to 0.89 on 2024) and session 6 (unconformalised boosted 0.77 to 0.89), I expect H2 to be refuted in Chicago a2i and SF a2i, where the same-day share moves between years, and to hold in the i2c targets. Prior 60%.
Done: `src/conformal.py` (stdlib: finite-sample conformal quantile, CQR scores and intervals after Romano, Patterson and Candes 2019, coverage, two-sample KS of calibration against test scores, coverage by month) and `tests/test_conformal.py` (hand counts for the rank rule including the infinite case, scores, floor, KS; a 200-repeat exchangeable check that average coverage is at least 0.79; a drift case where coverage falls under 0.7 and KS exceeds 0.2). 9 tests run, 3 skipped (need numpy/lightgbm).
Why no result: the feed hosts (data.cityofchicago.org, data.sf.gov, data.austintexas.gov, data.cityofnewyork.us) are refused by this session's egress proxy, as in session 4. **No number in `results/` changed.**
Test-writing note: the first exchangeable test failed (coverage 0.40) because it used signed Gaussian data under the interval's floor of 0; permit lags are non-negative, so the test now uses absolute values. This is a test bug, not a method finding.
Design for the real run (not yet coded): fit on years <= Y-2; early-stop on odd ISO weeks of Y-1 and conformalise on even weeks of Y-1, so the same rows never do both jobs; apply to Y; drift curve by repeating for Y = 2022, 2023, 2024.
Next: on a network that reaches the feeds, wire `conformal.evaluate` to `boosted.fit_predict` with the odd/even split, run the three cities, and report H2 with week-block bootstrap intervals on coverage.

## Session 6, 2026-10-31: milestone 3, LightGBM quantile models vs the baseline (H1)

Hypothesis (written before the run, H1 of the proposal): a gradient-boosted quantile model beats the per-city, per-type empirical quantile on mean pinball loss at q = 0.1, 0.5, 0.9 in the 2024 test year; refuted if the paired bootstrap interval of the difference includes zero in two of three cities. Planned analysis: 5 city/target pairs, features without calendar year (type, work class, log cost, area top-60, description length, month, weekday), calibration year used only for early stopping, paired week-block bootstrap (2,000 resamples) and weekly Wilcoxon.
Done: re-pulled the three feeds (`results/manifest.json` row counts moved by up to a few hundred rows: the feeds grew); `src/boosted.py`, `src/summarise_m3.py`, `tests/test_boosted.py`; results in `results/boosted_*_2024.json`, table in `results/m3_table.md`.
Deviation from plan, disclosed: a first configuration (learning rate 0.06, up to 600 rounds, 5 seeds) ran over 40 minutes on San Francisco application-to-issue without finishing on 4 cores, so I stopped it and ran learning rate 0.15, up to 300 rounds, 3 seeds for all five pairs. Only Chicago finished under the first configuration (one seed, earlier smoke test), with the same sign pattern; its numbers are discarded. No tuning on the test year.
Outcome: **H1 holds** (no city has two of three intervals including zero). 13 of 15 cells favour the boosted model (all of Austin and San Francisco; Austin a2i median -26%, q0.9 -36%). Chicago a2i: median -9.7% (interval excludes zero) but q0.1 +0.3% and q0.9 +6.5% are worse (intervals exclude zero on the wrong side): the baseline is better in the tails there. Boosted 80% interval coverage on 2024: 0.77 to 0.89, so the unconformalised model is no better calibrated than the baseline was (0.75 to 0.89); H2 is the next test.
Same-day classifier (Brier): better than the baseline's coarse grid in Austin a2i (0.103 vs 0.245) and SF a2i (0.210 vs 0.240); worse in Chicago a2i (0.268 vs 0.191, close to the constant train-rate predictor 0.294); equal in i2c where almost nothing is same-day. I did not diagnose why the Chicago classifier fails to beat a per-type rate; early stopping on a 2023 calibration year whose same-day share differs from 2024 is a candidate.
Limitations: one test year (the drift years 2022 and 2023 I planned were dropped for time); 3 seeds, so seed variance is only roughly reported (`boosted_pinball_per_seed`); one fixed configuration, not tuned; XGBoost, CatBoost, linear quantile regression and the neural net from the proposal are not run; Chicago contains only issued permits (survivorship).
Next: milestone 4 (split-conformal on 2023, H2, drift curve over 2022 to 2024), and a linear quantile baseline so "boosted beats the baseline" is not only "any model beats the reference class".

## Session 5, 2026-10-31: milestone 2 run on the real feeds; baselines for five city/target pairs

Hypothesis (written before the run): the reference-class baseline's 80% interval covers within 3 points of 80% on the 2024 test year in each city, and the same-day share in 2024 is near the all-time one (median 0 days everywhere).
Done: full re-pull of the three feeds (hosts reachable this time; about 20 minutes, CSVs outside git), `src/harness.py` run with test year 2024, train to 2022, calibrate 2023. Results in `results/baseline_<city>_<target>_2024.json`; `results/manifest.json` now has Austin's cost count (1,190,252, session 3's correction).
Outcome (application-to-issue, a2i, and issue-to-completion, i2c; interval = baseline q0.1 to q0.9):
| city / target | n test | same-day share | coverage 80% | pinball q0.1 / 0.5 / 0.9 | Brier same-day |
|---|---|---|---|---|---|
| Chicago a2i | 33,062 | 0.304 | 0.885 | 2.68 / 12.57 / 11.05 | 0.191 |
| SF a2i | 23,688 | 0.554 | 0.754 | 2.42 / 11.58 / 15.69 | 0.240 |
| Austin a2i | 53,002 | 0.063 | 0.791 | 8.00 / 39.91 / 37.05 | 0.245 |
| SF i2c | 19,184 | 0.001 | 0.802 | 14.99 / 56.80 / 36.10 | 0.001 |
| Austin i2c | 48,249 | 0.005 | 0.769 | 14.06 / 55.13 / 39.24 | 0.005 |
- **Hypothesis part 1 is refuted for three of five**: coverage is outside 77 to 83% for Chicago a2i (0.885), SF a2i (0.754) and Austin i2c (0.769). The baseline is the weakest fixed reference class, so this is the bar H2's conformal step must beat, and it shows the forward split drifts (calibration on 2023 is not 2024).
- **Part 2 is refuted for Austin**: its 2024 same-day share is 6%, not the median-0 picture of the full history (session 2), so the all-time zero-inflation is a property of earlier years; it varies by city and year (SF 55%, Chicago 30%). Targets must be modelled per period, not from pooled history.
- i2c has almost no zeros, so the two-part score collapses to plain pinball there.
Limitations: one test year; baseline only (no H1 claim yet); no bootstrap intervals run; the Austin loader counts every row as "issued" (2,382,939) although session 3 found 477,248 rows with no issue date, so the loader's issued column needs a check before milestone 3; the same-day Brier uses the coarse quantile grid.
Next: milestone 3 (LightGBM quantile models and the two-part score, H1), after fixing the Austin issued count and adding test years 2022 and 2023 for a drift curve.

## Session 4, 2026-10-31: milestone 2 harness written; not run on real data (feed hosts unreachable)

Hypothesis: none about the data; this session only builds and tests the instrument. The three data hosts returned HTTP 403 at the CONNECT step through the cloud proxy (`curl`: "CONNECT tunnel failed, response 403"), so no pull was possible and **no number in `results/` changed**.
Done: `src/harness.py` (stdlib): one quantile definition (type 7, linear interpolation), pinball loss, forward-in-time split (train <= Y-2, calibrate Y-1, test Y), the per-type reference-class baseline with fallback below 30 rows, the two-part score the session 2 finding demands (Brier of the same-day indicator plus tail pinball on y > 0), 80% interval coverage, and a paired week-block bootstrap. `tests/test_harness.py` has hand counts for the quantile, pinball, split, fallback, a zero-inflated end-to-end run and the bootstrap. `src/describe.py` now uses the same quantile, which resolves session 3's open item on p90 definitions: re-running it will move the p90s slightly from the session 2 table (floor(p n) versus interpolation).
Limitation: the same-day probability here is read off the baseline's quantile grid (coarse: 0, 0.1, 0.5 or 0.9), so its Brier score is a placeholder to beat, not a result. Calibration rows are split out but unused until milestone 4.
Next: on a network that reaches the feeds, `python3 src/permits.py pull --out DIR` then `python3 src/harness.py DIR --city sf --target a2i --test-year 2024` for each city/target, commit the `results/baseline_*.json`, then milestone 3 (boosted models, H1).

## Session 3, 2026-10-31: correction to the Austin cost field (found by a parallel run's duplicate pull)

A second run built the same milestone 1 at the same time (PR 12048, closed as a duplicate of 12049). Its independent pull of the same three feeds matched the row counts (851,778; 1,297,657; 2,382,939) and disagreed with this log on two facts:
- Austin does have a cost field, `total_job_valuation` (non-zero on 1,164,174 of 2,382,939 rows, 49%). The session 2 line "Austin has no cost field" is wrong; `src/permits.py` now maps it. Cross-city cost features are therefore available for all three cities, with zeros in Austin possibly meaning "not stated".
- Austin is not issued-only: 477,248 rows have no issue date, so it can show applied-but-not-issued permits.
- Not reconciled: that run's p90 application-to-issue lags (SF 70, Austin 176) differ from session 2's (81, 142). They used `statistics.quantiles` (exclusive method) and nulled years outside 1990 to 2100; session 2's method is in `src/describe.py`. Milestone 2 should fix one definition and test it against a hand count.
No tables were rebuilt: `results/` still holds the session 2 numbers and Austin's cost column there is empty until the next pull.

## Session 2, 2026-10-31: milestone 1, loaders, schema, datasheets, first lags

Hypothesis (before the pull): the full pulls reproduce session 1's row counts, and the median application-to-issue lag is at least 7 days in every city.
Done: `src/permits.py` (stdlib loader, one schema, paginated SoQL), 4 tests, datasheets for the three feeds, `results/manifest.json`, `src/describe.py` and `results/lags.json`. Pulled the full feeds (parquet not used; CSVs stay outside git).
Outcome:
- Row counts match session 1 exactly: Chicago 851,778; SF 1,297,657; Austin 2,382,939. Completed: SF 750,188, Austin 2,184,191, Chicago 0.
- **The lag hypothesis is refuted.** Median application-to-issue lag is 0 days in all three cities (p90: Chicago 56, SF 81, Austin 142). Most permits are issued over the counter the day they are filed, so the target is zero-inflated, not a smooth positive duration. Consequence for H1/H2: the empirical-quantile baseline gets q = 0.1 and 0.5 right trivially; the models will be judged mainly at q = 0.9 and on a two-part view (P(same day), then the tail). Milestone 2 must score that split explicitly or the pinball loss at q = 0.5 will be uninformative.
- Build time (issued to completed), negative values dropped: SF median 108 days (p10 15, p90 430), Austin median 104 (p10 7, p90 330). Both feeds carry thousands of negative lags (data entry order errors), counted in the manifest.
- Austin has no cost field; Chicago and SF do. Cross-city models must treat cost as missing for Austin, not zero.
- Limitations: no cleaning beyond dropping negative lags; "completed" is a status date and may not mean the build finished; trade permits dominate Austin; this is descriptive, no model run.

Next: milestone 2 (baselines, quantile-loss harness, forward-in-time split) with the zero-inflation handled up front.

## Session 1, 2026-10-31: proposal and feed probe

Hypothesis (before looking): at least three of the four named city feeds expose both an application and an issue date, and at least two expose a completion date.
Plan: count rows and date fields per feed through each feed's public SoQL API, read licences from dataset metadata, check every citation.

Outcome:
- Chicago `ydr8-5enu`: 851,778 rows, issue date on all of them (issued permits only, so survivorship-biased); no completion date field probed.
- San Francisco `i98e-djp9` (host now `data.sf.gov`): 1,297,657 rows, 1,233,195 issued, 750,188 completed.
- Austin `3syk-w9eu`: 2,382,939 rows, 2,184,191 completed.
- NYC DOB NOW `w9ak-ipjd`: my first query used wrong column names and failed; field names and licence not yet established, so NYC is out of milestone 1.
- Citations: all 12 works resolve (Crossref DOIs for four journal papers, arXiv abstract pages for eight). `cite_check.py` was rate limited (HTTP 429) on four arXiv ids, checked by hand.
- Prediction partly wrong: only two cities (SF, Austin) give a completion date, as predicted; Chicago's feed turned out to be issued-only, which I had not expected.

Next: milestone 1 (loaders, schema, datasheets).
