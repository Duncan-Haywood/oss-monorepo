# Datasheet: Austin Issued Construction Permits

Following Gebru et al. (2018), shortened. Pulled 2026-10-31 by `src/permits.py`; counts are in `results/manifest.json`.

- **Source:** https://data.austintexas.gov/resource/3syk-w9eu (Socrata SoQL API). Publisher's data, not ours.
- **Licence:** Public Domain U.S. Government, from the dataset metadata.
- **Schema mapping:** see `FEEDS` in `src/permits.py`. Dates are cut to the day; free-text descriptions are not kept, only their length; no personal fields (owner, contractor, applicant) are pulled.
- **Known limits:** Despite the title, not issued-only: 477,248 of 2,382,939 rows (20%) have no issue date (checked 2026-10-31 by a second, independent pull); 2,184,191 have a completed date per session 2's count. Cost is `total_job_valuation` (non-zero on 1,164,174 rows, 49%), mapped from session 3; the earlier text saying the feed has no cost field was wrong. 860 negative issue lags and 3,532 negative build times. Includes trade permits (plumbing, electrical), so most rows are not whole-building projects.
- **Not claimed:** that the rows are complete or that a date field means the same thing in another city.
