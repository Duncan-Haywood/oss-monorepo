# build-data log

## Session 2, 2026-10-31: milestone 1, loaders, schema, datasheets

Hypothesis (before running): the three feeds map onto one schema with every row keeping its issue date, and the pulled row counts equal the session 1 API counts (851,778, 1,297,657, 2,382,939). Also expected: Austin's issue-to-completion median is near 100 days and Chicago has no completion signal.
Plan: `permits.py` pulls selected columns by SoQL, maps to the schema, caches gzip CSVs outside git; `manifest.json` records counts; `datasheets/README.md` records licences and what each feed cannot show.

Outcome:
- Row counts matched exactly: Chicago 851,778; San Francisco 1,297,657; Austin 2,382,939 (`manifest.json`).
- Date coverage (rows with the date): applied 851,429 / 1,155,473 / 1,905,514; issued 851,778 / 1,108,447 / 1,905,691; completed 0 / 662,834 / 1,718,943 (Chicago / SF / Austin).
- Austin turned out to hold 477,248 rows with no issue date although titled "Issued Construction Permits", so my datasheet assumption that it is issued-only was wrong; it has non-issued rows too.
- Descriptive durations in days (deciles 1, 5, 9; not a model result): applied to issued, Chicago 0 / 0 / 56 (n 851,348), SF 0 / 0 / 70 (n 1,102,475), Austin 0 / 6 / 176 (n 1,904,654). Issued to completed, SF 14 / 105 / 436 (n 653,209), Austin 7 / 103 / 346 (n 1,705,347). Median is 0 days for Chicago and SF: most permits issue the day they are filed (over-the-counter), so a single quantile model will need the type split the baseline already uses.
- Negative durations (completed or issued before applied) were dropped from these summaries: 81 Chicago, 2,089 SF, 860 Austin; the evaluation harness must apply the same documented rule.
- 4 unit tests pass for the loader mapping, date sentinel handling and contractor hashing.
- Prediction partly wrong: counts and the Austin median held; Austin is not issued-only.

Next: milestone 2, baselines and the forward-in-time pinball-loss harness.

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
