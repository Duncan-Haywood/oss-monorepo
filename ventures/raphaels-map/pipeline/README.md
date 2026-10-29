# Raphael's Map pipeline

Fetch official files on a GitHub runner, build the published aggregates in
`../data/` anywhere, test with synthetic fixtures. The data contract is
[`../ARCHITECTURE.md`](../ARCHITECTURE.md).

```
official files --(fetch.py on a runner)--> branch raphaels-map-raw
raphaels-map-raw --(build_us.py, build_surveys.py, build_intl.py)--> data/*.json
```

## 1. Fetch (GitHub Actions)

The cloud agent containers cannot reach census.gov and most publishers, so
`fetch.py` runs in `.github/workflows/raphaels-map-fetch.yml`:

- **Actions → "raphaels-map fetch" → Run workflow** (input `only`: a comma
  list of source ids such as `acs5,census_geo`; empty = all), or
- push a change to `pipeline/fetch.py` on a `claude/raphaels-map*` branch.

The job pushes everything it downloaded, plus `manifest.json` (URL, size,
SHA-256 and time of every file, and the errors of failed sources), to the
`raphaels-map-raw` branch as one replaced commit. Files over 95 MB are
dropped by the workflow, so `fetch.py` filters the ACS Summary File `.dat`
files and `Geos20245YR.txt` to nation, state, county and CBSA rows before
saving them; the manifest's SHA-256 is of the filtered file.

## 2. Build the U.S. files

```
git fetch --depth=1 origin raphaels-map-raw
mkdir -p /tmp/rm-raw && git archive origin/raphaels-map-raw | tar x -C /tmp/rm-raw
python3 -I ventures/raphaels-map/pipeline/build_us.py --raw /tmp/rm-raw --out ventures/raphaels-map/data
```

Needs Python 3.10+ with `openpyxl` and `pyshp` (imported as `shapefile`);
everything else is the standard library. About 20 seconds. `--no-geo` skips
the map paths.

It writes `data/us/{geographies,county_observations,state_observations,cbsa_observations,build_checks}.json`,
`data/geo/us_counties.json`, `data/geo/state_<fips>.json` (50 states, DC,
Puerto Rico), `data/sources.json` and `data/metrics.json`.

- **Run it again after `data/communities.json` changes**: `public_venues` is
  counted from that file at build time.
- **Run it after the survey or international builds**: `sources.json` and
  `metrics.json` are the union of this script's own registry and every
  `{sources: [...], metrics: [...]}` fragment in `pipeline/registry/*.json`.
  A fragment entry replaces the base entry with the same id. Two fragments
  that disagree about one id stop the build. Files of another shape (such as
  `nsfg_codings.json`) are skipped and listed in `build_checks.json`.

What the build refuses to do (it stops with `BUILD FAILED:` and exit code 2):

- use an ACS code whose published label differs from the one the spec
  expects (checked against `groups_*.json` and against the Summary File
  table shells);
- read a FIPS code stored as a number, a duplicate GEO_ID, or a duplicate
  or ambiguous 2020 U.S. Religion Census Catholic row (group code 081 under
  another name, "Catholic Church" under another code, or county names that
  differ between the two workbooks);
- write a synthetic raw directory into `data/`.

What it reports instead of hiding, in `data/us/build_checks.json`:

- county sums against state rows and state sums against the nation row;
- B01001 against B12002 female 20–29 totals;
- Religion Census join counts: counties without a Catholic Church row
  (shown as unavailable, not as zero), Connecticut (`geo_changed`: 2020 old
  counties against 2024 planning regions), Puerto Rico (not covered), and
  CBSAs whose 2020 territory differs from the 2023 delineation
  (`geo_changed`);
- `communities.json` rows that did not join to a county.

## 3. Test

```
python3 -m pytest ventures/raphaels-map/pipeline/test_build_us.py -q
```

The unit tests build a complete **synthetic** raw directory in pytest's
temporary folder (`fixtures/make_fixtures.py`; every value is invented and
every place is named "Fixture …") and check:
- label verification and failure on a mismatch;
- exact cell sums and MOE combination;
- special values becoming null rather than 0;
- FIPS zeros;
- rejection of duplicate and ambiguous Religion Census rows;
- Connecticut `geo_changed`;
- vintage and denominator flags;
- metros read from their own row rather than summed from counties;
- projection bounds;
- the registry merge.

The last four tests check invariants on the real `data/` files when they
exist, and skip otherwise.
