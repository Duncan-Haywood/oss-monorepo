# build-data log

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
