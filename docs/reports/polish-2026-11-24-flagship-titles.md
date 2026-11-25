---
kind: polish
topics: [seo]
date: 2026-11-24
---
# Polish 2026-11-24: clothing-design-studio and wall-framing-takeoff titles

Picked item 3 of "Still weakest" in `polish-2026-11-23-story-title-budget.md`
(carried in `polish-2026-11-23-einvoice-titles.md` item 3): the two largest
long-title ventures in `check_title_meta.py`.

## What changed

- 34 clothing-design-studio and 27 wall-framing-takeoff pages: new head
  `<title>` of at most 70 characters (was 71 to 104). Search words first; every
  fact comes from the old title; `h1`, `og:title` and descriptions untouched.
- `ventures/<both>/title-length.test.mjs`, copied from einvoice-preflight: every
  page title at most 70 characters, entities decoded.
- Post: `docs/posts/2026-11-24-flagship-titles-fit-search.md`.

## Measured

- `check_title_meta.py`: long-title 1,166 → 1,105 (4,211 pages); neither venture listed.
- `node --test page.test.mjs journey.test.mjs` (clothing): 18 pass.
  `node --test page.test.mjs` (wall-framing): 135 pass. New title tests pass.
- No ranking or click claim: no search-console reading for these pages.

## Still weakest, and what I would do next

1. **ai-bookkeeper (17), league-schedule-generator (14), ebay-fee-calculator (8)**:
   next largest long-title ventures. Same approach plus a copied
   `title-length.test.mjs`.
2. **A catalogue-wide title test** instead of per-venture copies: a single
   `platform/pages` test with a baseline file of today's 1,105 offenders that
   may only shrink would stop new long titles everywhere.
3. Carried over: og:title on einvoice country guides; `writing/` and `research/`
   mid-title ellipses; venture-fold `--write-baseline` on a full build.
