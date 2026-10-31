# Datasheet: San Francisco Building Permits

Following Gebru et al. (2018), shortened. Pulled 2026-10-31 by `src/permits.py`; counts are in `results/manifest.json`.

- **Source:** https://data.sf.gov/resource/i98e-djp9 (Socrata SoQL API). Publisher's data, not ours.
- **Licence:** Open Data Commons Public Domain Dedication and License (PDDL 1.0), from the dataset metadata.
- **Schema mapping:** see `FEEDS` in `src/permits.py`. Dates are cut to the day; free-text descriptions are not kept, only their length; no personal fields (owner, contractor, applicant) are pulled.
- **Known limits:** Contains permits in every status (1,297,657 rows; 1,233,195 issued; 750,188 completed). Applied = `filed_date`. 2,257 negative issue lags and 736 negative build times. Cost is `estimated_cost` (revised cost not used). Completion is a status event, not an inspection-verified finish.
- **Not claimed:** that the rows are complete or that a date field means the same thing in another city.
