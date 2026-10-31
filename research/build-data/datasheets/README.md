# Datasheets for the three feeds (Gebru et al. 2018, abridged)

Source: each dataset's Socrata metadata (`/api/views/<id>.json`), read 2026-10-31.
Counts are in [`../manifest.json`](../manifest.json). Pulls are cached under `../data/` (gitignored); no raw data is committed.

| | Chicago | San Francisco | Austin |
|---|---|---|---|
| Dataset | Building Permits, `ydr8-5enu` | Building Permits, `i98e-djp9` | Issued Construction Permits, `3syk-w9eu` |
| Host | data.cityofchicago.org | data.sf.gov | data.austintexas.gov |
| Publisher | City of Chicago | City and County of San Francisco | City of Austin, Texas |
| Licence field | "See Terms of Use" (no open licence named) | Open Data Commons PDDL 1.0 | Public Domain U.S. Government |
| Application date | `application_start_date` | `filed_date` | `applieddate` |
| Issue date | `issue_date` | `issued_date` | `issue_date` |
| Completion date | none | `completed_date` | `completed_date` |
| Cost field | `reported_cost` | `estimated_cost` (also `revised_cost`) | `total_job_valuation` (plus per-trade valuations) |
| Contractor | up to 15 free-text contacts, not mapped | not published | `contractor_company_name`, hashed |

## What each feed can and cannot show

- **Chicago** is an issued-permits table: every row has an issue date. Permits that were applied for and never issued are absent, so application-to-issue durations are survivorship-biased (short or successful ones only). Claims that depend on non-issued permits exclude Chicago. Its licence field names no open licence, so the redistribution terms need reading before any derived data file is published; the programme publishes code and aggregate results, not Chicago rows, until then.
- **San Francisco** keeps non-issued records (status e.g. `withdrawn`, `expired`, `filed`), so right-censoring can be handled. `completed_date` is populated for a subset (see manifest).
- **Austin** is titled "Issued Construction Permits" but the pull has 477,248 rows with no issue date (1,905,691 of 2,382,939 have one), so it also holds non-issued records. Its `completed_date` is missing for active permits (right-censored for the build-duration target).

## Schema and null policy

`permits.py` maps each feed onto `permit_id, city, permit_type, work_class, description, est_cost, applied, issued, completed, status, area, units, contractor_hash`. A field a feed lacks is an empty cell, never imputed. Dates are cut to `YYYY-MM-DD`; years outside 1990 to 2100 are treated as null (sentinel values such as `0001-01-01`). Costs are the feed's own units and are not inflation-adjusted. Permit-type and work-class vocabularies differ by city and are **not** harmonised in this milestone; cross-city use (H4) needs a mapping, which is its own step.

## Personal data

Contractor company names are hashed (SHA-256, first 12 hex characters, upper-cased and whitespace-normalised) and the hash is the only thing the schema keeps; personal-name fields (`contractor_full_name`, applicant fields, Chicago contacts) are never read. Free-text descriptions can contain names or addresses; they stay in the local cache and are used only as model text features.
