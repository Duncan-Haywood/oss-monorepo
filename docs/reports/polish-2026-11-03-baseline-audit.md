---
kind: polish
topics: [seo]
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: site-wide SEO baseline audit (nothing to fix)

**Method.** Full `node platform/pages/build.mjs` then `node platform/pages/check.mjs` (clean: 1326 products, 45 category pages, 6685 pages, no dead links). A script then walked every built `.html` file, skipping meta-refresh redirect stubs.

**Measured.**
- Duplicate `<title>` values among non-redirect pages: 0.
- Indexable pages with no meta description of 30+ characters: 0. The 8 without one (`offline`, `404`, three `sample-*` packs and others) are all `noindex`.
- Titles over the 70-character budget: `platform/pages/propose_seo_titles.py` reports 0 proposed, 0 with no clean cut (the batch 5-12 backlog is finished).
- Products missing an `llms.txt`: `platform/ci/missing_llms_txt.py` prints nothing.
- Pages where a naive `<h1>` count is not 1: 4 (`page-seo-audit`, `structured-data-drift-check`, `affiliate-disclosure-checker`, `shift-roster-builder`). All are `<h1>` text inside inline script templates or sample markup, not real second headings.

**Not measured.** Lighthouse, rankings, traffic, phone screenshots.

**Still weakest / next.** The metadata baseline is clean, so the next polish run should spend its time on visual passes (hub, a flagship, research index at phone width) or answer-first leads (`platform/pages/answer-lead.test.mjs`), not more title or description sweeps.
