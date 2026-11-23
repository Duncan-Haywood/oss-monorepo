---
kind: polish
topics: [seo]
date: 2026-11-23
---
# Polish: story page titles fit a search result (2026-11-23)

Did not pick from the last reports' "Still weakest" lists. Item 1 of
`polish-2026-11-23-three-tool-folds.md` (the "After using this, you can now"
paragraph) is on only 13 venture pages, not dozens, so a shared move would
clear at most 13 of the 312 fold-baseline entries. I screenshotted the hub, the
wall-framing-takeoff flagship, /research/, /stories/ and a blog post at 390 and
1280 px. None scrolls sideways and none had an obvious visual defect, so I
took the largest SEO class defect from `check_title_meta.py` instead.

## What changed

- `ventures/saints-by-candlelight/episodes.mjs`: `episodeTitle(ep)` keeps the
  first of `| Saints by Candlelight, a bedtime saints podcast` /
  `, bedtime podcast` / `| Saints by Candlelight` / nothing that fits
  `TITLE_MAX = 70`. The index title is now 68 characters.
- `ventures/hearth-and-horizon/stories.mjs`: `storyTitle(story, shelf, hasAudio)`
  does the same with `: a Catholic bedtime story (text and audio)` /
  `: a Catholic bedtime story` / `: a bedtime story` / nothing (sci-fi shelves:
  `a free science fiction short story` / `a short story`). The index title is now
  69 characters and keeps "AI-written".
- Both ventures were regenerated (`node generate.mjs`; `--check` is clean). A
  test in each suite asserts every story's title fits.
- `platform/ci/check_title_meta.py` unescapes entities before it counts, plus a
  test for that.

## Measured (`check_title_meta.py`, decoded length)

| scope | before | after |
|---|---|---|
| saints-by-candlelight | 169 / 170 | 0 |
| hearth-and-horizon | 46 / 544 | 0 |
| all `ventures/` (old checker → new) | 1,492 | 1,259 |

On the built `dist/` (12,887 pages) the old checker reported 1,737 before this
change.

## Still weakest, and what I would do next

1. **einvoice-preflight: 100 long titles**, mostly hand-written
   `*-e-invoice-mandate.html` guides with 70- to 110-character titles before
   ` | E-invoice Preflight`. Each needs a query-shaped rewrite (country +
   "e-invoicing mandate" + the date). `deadlines-page.mjs` and
   `whichapplies.mjs` could take a suffix-fitting helper like the one above.
2. **writing/ (blog) and research/ titles in dist**: `/research/<slug>/`
   truncates with "…" and then adds `| Open research`. Check whether dropping the
   suffix when the title is long reads better than an ellipsis mid-title.
3. **clothing-design-studio (34) and wall-framing-takeoff (27)**: worked-example
   pages with long hand-written titles.
4. Carried over: venture-fold `--write-baseline` on a full build
   (`polish-2026-11-23-phone-band-rhythm.md`, item 2).
