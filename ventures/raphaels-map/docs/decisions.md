# Decisions

Change control for SPEC.md §13: date, what changed, why, alternatives, and
the new acceptance criterion.

## D1, 2026-10-29: static site + Python pipeline, not FastAPI + Next.js

**Change.** SPEC §8 asks for FastAPI, DuckDB, Next.js and Tailwind. The build
is a static page (ES modules, no bundler) over committed JSON aggregates,
with a Python pipeline that writes those aggregates.

**Why.** This monorepo publishes on GitHub Pages and wants zero per-user cost
and self-hostable products (`PRODUCT_PLAYBOOK.md` §2). A server would have to
run somewhere, cost money and need auth; the data is a few megabytes of
public aggregates that a browser can rank and compare on its own. Every
endpoint in SPEC §8 maps to a file in `ARCHITECTURE.md` with the same fields.
DuckDB/Parquet add nothing at this size; the build uses Python's standard
library plus pandas only where a source ships Stata or Excel.

**Alternatives.** Next.js static export (adds a node build to the Pages
pipeline for no user-visible gain); FastAPI on a VM (a running cost, against
the playbook).

**Acceptance.** The page works opened from a clone with `python3 -m http.server`
and from Pages; `node --test` covers scoring, export and data loading;
`pytest` covers the pipeline.

## D2, 2026-10-29: downloads happen on a GitHub runner

**Change.** The cloud agent containers' network policy refuses
api.census.gov, www2.census.gov, the UN, the CDC and NORC. `pipeline/fetch.py`
runs in `.github/workflows/raphaels-map-fetch.yml` and pushes the raw files to
the `raphaels-map-raw` branch; the build runs anywhere from that branch.

**Why.** The spec forbids standing in for blocked data with remembered
numbers, and the runner reaches the publishers.

**Acceptance.** `raw/manifest.json` on that branch lists every file's URL,
size, SHA-256 and retrieval time; `data/sources.json` carries them through.
