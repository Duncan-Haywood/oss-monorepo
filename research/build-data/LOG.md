# build-data log

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
