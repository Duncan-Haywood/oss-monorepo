# Datasheet: Seattle Building Permits

Following Gebru et al. (2018), shortened. Pulled 2026-11-09 by `src/permits.py`; counts are in `results/manifest.json`.

- **Source:** https://data.seattle.gov/resource/76t5-zqzr (Socrata SoQL API), "Building Permits", attribution City of Seattle. Publisher's data, not ours.
- **Licence:** "Public Domain", from the dataset metadata (`/api/views/76t5-zqzr.json`, checked 2026-11-09).
- **Schema mapping:** see `FEEDS` in `src/permits.py`: type = `permittypemapped`, work class = `permitclassmapped`, cost = `estprojectcost`, dates = `applieddate`, `issueddate`, `completeddate`, area = `originalzip`. Free-text descriptions are not kept, only their length; contractor, address and coordinates are not pulled.
- **Known limits:** 194,184 rows; 148,050 applied, 141,221 issued, 108,173 completed, 158,952 with a cost. The feed says "issued or in progress", so permits that were never issued are largely absent (survivorship, as in Chicago). 15 negative issue lags and 10 negative build times, dropped and counted. The feed also has plan-review day counts (`totaldaysplanreview` etc.) that are measured after the fact and are not used as features (leakage).
- **Not claimed:** that the rows are complete or that a date field means the same thing in another city.
