# Raphael's Map: architecture and data contract

The shared contract between the pipeline (Python, `pipeline/`), the published
data (`data/`) and the page (ES modules, `*.mjs`, `index.html` and friends).
Change it in the same commit as the code that needs the change.

## Shape

```
official files --(GitHub runner: pipeline/fetch.py)--> branch raphaels-map-raw
raphaels-map-raw --(anywhere: pipeline/build_*.py)--> data/*.json (committed)
data/*.json --(browser: *.mjs, no build step)--> the page on GitHub Pages
```

- **No server.** The spec's FastAPI + Next.js stack is replaced by a static
  site plus a Python pipeline (`docs/decisions.md`, D1). The spec's API
  contracts become JSON files with the same fields; the page does the
  ranking, comparison and export in the browser.
- **Nothing fabricated.** A value that was not read from an official file is
  `null` with a flag saying why. Test fixtures live in `tests/fixtures/`, are
  marked `"synthetic": true`, and are never loaded by the page.
- **Fetch and build are separate** so the build is reproducible from the raw
  branch without network, and the raw branch holds the SHA-256 of every file
  (`raw/manifest.json`).
- **Raw files are not merged to `main`.** Survey microdata (GSS, NSFG) is
  public-use but stays out of the tree; only aggregates are committed.

Get the raw files locally:

```
git fetch --depth=1 origin raphaels-map-raw
git worktree add /tmp/rm-raw origin/raphaels-map-raw   # or: git archive
python3 pipeline/build_us.py --raw /tmp/rm-raw --out data
```

## Observation

Every number the page shows is an observation object:

```json
{"e": 1234, "moe": 210, "flags": []}
```

- `e`: the estimate, or `null`.
- `moe`: the 90% margin of error the ACS publishes (summed cells:
  `sqrt(sum(moe_i^2))`, the Census Bureau's approximation, flagged
  `moe_approx`), or `null` when the source has none.
- `flags`: zero or more of
  `not_ingested` (source not fetched yet), `not_published` (source has no
  such cell), `suppressed_small_sample` (n_eff < 30),
  `exploratory_sample` (30 <= n_eff < 100), `moe_approx`,
  `vintage_mismatch` (numerator and denominator from different years),
  `denominator_all_ages`, `proxy`, `unvalidated`, `derived`, `geo_changed`
  (boundary does not match across vintages, e.g. Connecticut 2022).

`null` is never `0`. A real zero is `{"e": 0, ...}`.

## Files in `data/`

| File | Contents |
|---|---|
| `sources.json` | `{sources: [{id, title, provider, landing_url, dataset_version, reference_period, retrieved_at, license, access, citation, status, files:[{url, sha256}] , notes}]}`. `status` is `ingested`, `not_ingested`, `gated` (needs registration; importer only) or `failed`. |
| `metrics.json` | `{metrics: [{metric_id, label, short, universe, unit, definition, source_variable_ids, method, source_id, class, caveats, higher_is}]}`. `class` is one of `observed`, `survey_estimate`, `projection`, `proxy`, `unvalidated_hypothesis`, `user_listing`. |
| `us/geographies.json` | `{vintage, counties: [{id:"08013", name:"Boulder County", state:"08", state_name, county:"013", cbsa, cbsa_name, lat, lon, land_sqmi}], states: [{id:"08", name, abbr}], cbsas: [{id, name, kind:"metro"|"micro", counties:[...]}]}` |
| `us/county_observations.json` | `{vintage_label, source_ids, observations: {"08013": {"women_20_24": Observation, ...}}}` — every county, every county metric. |
| `us/state_observations.json`, `us/cbsa_observations.json` | Same shape keyed by state FIPS / CBSA code. Metros are their own unit, never summed from rounded county values. |
| `geo/us_counties.json` | National county paths: `{viewBox, projection, paths: {"08013": "M…Z"}, states: {"08": "M…Z"}}`, Albers USA style with Alaska and Hawaii insets. |
| `geo/state_<fips>.json` | Same shape, one state, a projection fitted to it. |
| `communities.json` | `{venues: [{id, public_name, category, geo_id, city, state, public_url, verified_at, verification, ministry, age_scope_published, public_event_frequency, notes}]}`. `verification` says how the listing was checked (`fetched_official_page` with date, or `listed_from_search` — not verified). |
| `surveys/questions.json` | `{datasets:[{id, title, source_id, years, weight_variable, design}], questions:[{dataset_id, variable, original_text, response_map, harmonized_concept, alignment: "direct"|"partial"|"related", years}]}` |
| `surveys/crosstabs.json` | `{tables:[{id, dataset_id, variable, years, filters:{sex, age_band, relig, attend, marital}, rows:[{category, pct, ci_low, ci_high}], n, n_eff, weighted_base, excluded:{dk, refused, iap}, flags}]}`; suppressed tables keep `n`, `n_eff` and `flags` with `rows: null`. |
| `surveys/proxy_tests.json` | Held-out results of the proxy hypotheses (SPEC 6.3): `{tests:[{id, hypothesis, outcome, predictors, train_years, test_years, n_train, n_test, auc, auc_ci, baseline_auc, brier, baseline_brier, verdict, notes}]}`. |
| `intl/countries.json` | `{countries:[{iso3, name, observations:{tfr_2023: Observation, ...}}], notes}` — country level only. |

## County metrics (ids are the contract)

From the American Community Survey (ACS) 5-year detailed tables, codes
**checked against the published group metadata at build time** (the build
fails if a label does not match):

- `total_population` (B01003_001), `female_population` (B01001_026)
- `women_18_19` (B01001_031), `women_20_24` (B01001_032 + _033 + _034),
  `women_25_29` (B01001_035), `women_30_34` (B01001_036),
  `women_20_29` (sum)
- `never_married_women_20_24`, `never_married_women_25_29`,
  `never_married_women_20_29`, `never_married_women_30_34` from B12002
  (the build finds the cells by label: Female → Never married → age)
- `never_married_share_women_20_29` (derived: ratio, flagged `derived`)
- `women_20_29_per_1000` (derived density against total population)

From the 2020 U.S. Religion Census (if fetched):

- `catholic_adherents`, `catholic_congregations`
- `catholic_adherents_per_1000` (against the Religion Census's own 2020
  population column if it has one, else ACS, flagged `vintage_mismatch`;
  always `denominator_all_ages`)
- `catholic_congregations_per_100k`

Exploratory proxy (class `unvalidated_hypothesis`, off in the default
weights):

- `rep_pres_share_2024` (MIT Election Lab county returns)

Access:

- `public_venues` (count of `communities.json` rows in the county,
  class `user_listing`)

## Page modules

| Module | Job |
|---|---|
| `data.mjs` | Fetch and cache the JSON files; never throws on a missing file, returns `{missing: true}`. |
| `format.mjs` | Numbers, MOE, flag badges, acronym expansion on first use. |
| `score.mjs` | The four dimension scores and the research priority index (SPEC 6.4): percentile normalisation, log-scale counts, re-normalised weights over available dimensions, coverage, rank sensitivity. Pure functions, tested. |
| `map.mjs` | SVG choropleth from `geo/*.json`; quantile bins; missing hatched. |
| `compare.mjs`, `rank.mjs`, `explore.mjs`, `surveys.mjs`, `communities.mjs`, `toolkit.mjs`, `methodology.mjs`, `intl.mjs` | One view each. |
| `export.mjs` | Markdown and CSV report with definitions and citations. Pure, tested. |
| `usage.mjs` | Anonymous local counters, the repo pattern. |

## Extensions added during the first build

- **URL state.** Metro ids carry an `m` prefix in the hash (`#compare?ids=08013,m19740`)
  because CBSA codes are five digits like county FIPS. Shared ranking settings
  live in the hash (`#rank?st=08&band=20_24&mode=volume&w=70,30,0,0,0`) and
  override saved preferences; preferences are stored under
  `raphaels-map-prefs`, toolkit text under `raphaels-map-toolkit`, venue notes
  under `raphaels-map-community-notes`.
- **Values evidence hook.** A metric counts toward `values_evidence` only when
  `metrics.json` gives it `"dimension": "values_evidence"` and class
  `survey_estimate`. None does at county level today.
- **Default weights.** Meeting access is 0 in both modes because
  `communities.json` is a sample (`score.mjs`, `MODES`).
- **Survey tables** may carry `period`, `mode`, `text_kind` (`label` when only
  the short variable label exists), `filters.country` (imported surveys),
  `excluded.missing_unsplit`, and flags `mode_mixed`, `coding_unconfirmed`,
  `missing_codes_collapsed`, `approx_ci`. Proxy tests may carry `difference`
  (head-to-head tests), `delta_auc_ci95`, `confirmatory`, and the verdict
  `exploratory (no confirmatory verdict)`.
- **International observations** may carry `year`, `source_id`, `indicator`,
  `status_code`, `class` and `note`; the file has `groups` (countries by data
  availability).
- **Venues** may carry `county_name`, `verified_title` and `link_status`.
