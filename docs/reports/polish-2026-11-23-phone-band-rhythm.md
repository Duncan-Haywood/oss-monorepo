# Polish: tool-page band uses the site's phone rhythm (2026-11-23)

Picked item 1 of "Still weakest" in `polish-2026-11-22-tablet-nav-row.md`.

## What was wrong

`VENTURE_CHROME_CSS` in `platform/pages/build.mjs` sets `.pf-chrome-top .pfs-bar{padding:12px 0}`
and `.pf-chrome-top .pfs-crumbs{padding:0 0 10px}`. Both are later in the cascade than
site-nav.mjs's `@media (max-width:720px){.pfs-bar{padding:9px 16px}}`, so on a phone every tool
page kept the desktop padding.

## What changed

- `build.mjs`: `@media (max-width:720px){.pf-chrome-top .pfs-bar{padding:9px 0}.pf-chrome-top .pfs-crumbs{padding:0 0 9px}}`
  right after the desktop rules. The `[data-pfs-inset]` side-gutter rule is more specific
  (0,3,0 vs 0,2,0), so it still sets left/right padding.
- `band-inset.test.mjs`: a test that the phone rule exists, follows the desktop rule, and the inset
  rule is still present.

## Measured (preview build, `--only=wall-framing-takeoff,ebay-fee-calculator,bank-statement-pdf-to-csv`, Chromium)

| width | page | band height | bar | trail | h1 top | first input top |
|---|---|---|---|---|---|---|
| 390 | ebay-fee-calculator | 115 → 108 | 86 → 80 | 28 → 27 | 156 → 149 | 602 → 595 |
| 390 | wall-framing-takeoff | 115 → 108 | 86 → 80 | 28 → 27 | 158 → 151 | 806 → 799 |
| 390 | bank-statement-pdf-to-csv | 115 → 108 | 86 → 80 | 28 → 27 | 188 → 181 | 1166 → 1159 |
| 390 | /about/ (site page) | 79 → 79 | | | 153 → 153 | |
| 1280 | all three tools | 86 → 86 | 57 → 57 | 28 → 28 | unchanged | unchanged |

Screenshot of ebay-fee-calculator at 390 after the change checked by eye: brand, Search, the
scrolling links row and the trail all sit evenly; no crowding.

## Still weakest, and what I would do next

1. **Bar is 80 px against the site page's 78 at 390**: the remaining 2 px is the brand/Search row
   content, not padding. Not worth chasing unless a fold page sits within 2 px.
2. **Re-run the venture-fold baseline** (`venture-fold.mjs --write-baseline` on a full build): the
   16 pages within 7 px of the fold line (829 to 835) should now pass; drop them from the baseline.
3. **Browser check at 744 px for the nav row** (`polish-2026-11-22-tablet-nav-row.md` item 3) is
   still open.
4. bank-statement-pdf-to-csv's 110-word header testing note (`polish-2026-11-22-related-links-cards.md`
   item 1) still puts its file picker at 1,159 px on a phone.
