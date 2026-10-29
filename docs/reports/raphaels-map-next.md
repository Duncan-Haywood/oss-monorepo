# raphaels-map: state after the first build, and what to do next

Written 2026-10-29 for the next run on `ventures/raphaels-map/`.

## How the data moves

The agent container cannot reach census.gov, the CDC, NORC or the UN.
`.github/workflows/raphaels-map-fetch.yml` runs `pipeline/fetch.py` on a
GitHub runner (on a push that changes `fetch.py`, or by workflow dispatch)
and force-pushes the raw files to the `raphaels-map-raw` branch. Locally:

```
git fetch --depth=1 origin raphaels-map-raw
mkdir /tmp/raw && git archive origin/raphaels-map-raw | tar x -C /tmp/raw
cd ventures/raphaels-map
python3 pipeline/apply_venue_checks.py --raw /tmp/raw
python3 pipeline/build_intl.py --raw /tmp/raw --out data
python3 pipeline/build_surveys.py --raw /tmp/raw --out data
python3 pipeline/build_us.py --raw /tmp/raw --out data   # last: merges the registries
```

The workflow caps files at 95 MB; the ACS summary files are filtered on the
runner to nation, state, county and CBSA rows (`keep_geos`).

## Open items, most valuable first

1. **NSFG percentages are withheld.** The CSV has no value labels, so
   `ADDEXP`, `INTENT`, `RELIGION`, `ATTNDNOW` and `FMARITAL` are
   `coding_unconfirmed` and their tables publish n and n_eff only. Add the
   2022-2023 female respondent codebook to `fetch.py` (its link is in
   `raw/nsfg/nsfg-2022-2023-puf.html`), read each variable's codes, and set
   `confirmed_from` in `pipeline/registry/nsfg_codings.json`. That unlocks
   expected-births estimates, which are the closest public measure to the
   spec's "intended family size".
2. **GSS missing codes.** Read the Stata files with
   `pyreadstat.read_dta(..., user_missing=True)` in `fetch.py` so
   don't-know, refused and no-answer stay distinct (now collapsed and
   flagged `missing_codes_collapsed`).
3. **The venue list is a sample** (21 rows, 14 verified). A systematic source
   (diocesan young-adult directories, Newman/FOCUS campus lists) would let
   meeting access carry weight; it is 0 by default for that reason.
4. **County election returns** (MIT Election Lab, Harvard Dataverse) answered
   HTTP 400; the dataset may need its guestbook accepted. The metric is
   defined and empty. JHU Homeschool Hub answered 403.
5. **Connecticut**: 2020 Religion Census counties do not map to the 2022
   planning regions. An apportionment by population would need a crosswalk
   and a flag.
6. **Owner to confirm** decision D3 (republishing ASARB Catholic county counts).

## What not to redo

The headline GSS estimates were reproduced independently (n 708, n_eff 431,
14.9% ideal 4+ for women 18-29, 2010-2018; 18.6% weekly attendance among
Catholic women 18-29). County sums equal state rows exactly
(`data/us/build_checks.json`).
