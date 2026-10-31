# Datasheet: Austin Issued Construction Permits

Following Gebru et al. (2018), shortened. Pulled 2026-10-31 by `src/permits.py`; counts are in `results/manifest.json`.

- **Source:** https://data.austintexas.gov/resource/3syk-w9eu (Socrata SoQL API). Publisher's data, not ours.
- **Licence:** Public Domain U.S. Government, from the dataset metadata.
- **Schema mapping:** see `FEEDS` in `src/permits.py`. Dates are cut to the day; free-text descriptions are not kept, only their length; no personal fields (owner, contractor, applicant) are pulled.
- **Known limits:** Issued permits only (every row has an issue date); 2,184,191 have a completed date. No cost field in this feed. 860 negative issue lags and 3,532 negative build times. Includes trade permits (plumbing, electrical), so most rows are not whole-building projects.
- **Not claimed:** that the rows are complete or that a date field means the same thing in another city.
