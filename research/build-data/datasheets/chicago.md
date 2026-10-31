# Datasheet: Chicago Building Permits

Following Gebru et al. (2018), shortened. Pulled 2026-10-31 by `src/permits.py`; counts are in `results/manifest.json`.

- **Source:** https://data.cityofchicago.org/resource/ydr8-5enu (Socrata SoQL API). Publisher's data, not ours.
- **Licence:** City of Chicago; licence field reads "See Terms of Use" (no standard licence named; check the city's terms before redistributing derived rows).
- **Schema mapping:** see `FEEDS` in `src/permits.py`. Dates are cut to the day; free-text descriptions are not kept, only their length; no personal fields (owner, contractor, applicant) are pulled.
- **Known limits:** Issued permits only: every row has an issue date, no completion date. Survivorship-biased: permits never issued are absent. Issue lag has 81 negative values (issue before application start), dropped from quantiles. Cost is `reported_cost` (813,350 of 851,778 rows have it).
- **Not claimed:** that the rows are complete or that a date field means the same thing in another city.
