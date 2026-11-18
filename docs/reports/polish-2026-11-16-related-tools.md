---
kind: polish
topics: [seo, design]
date: 2026-11-16
---
# Polish 2026-11-16: footer related tools ranked by shared words, orphans balanced

Track: polish/0. Picked item 1 of "Still weakest" in `polish-2026-11-15-footer-lead.md` ("the
related links under it are chosen by category, and on Vendor Watch they're Shopify/Salesforce CSV
checks"), listed again as item 4 of `polish-2026-11-16-story-cards.md`. Open PRs with `polish` in
the title (3) touch none of this.

## What changed (`platform/pages/build.mjs`)

- `relatedToolScore(surfaces, a, b)`: IDF-weighted overlap of content words in name + slug
  (weight 1) and full description (weight 0.5). A stopword list removes generic English and the
  catalogue's boilerplate ("free", "calculator", "browser", "private", ...); plurals and `-ing`/`-er`
  fold to a stem. Words in one tool or in more than a fifth of tools score 0. Index built once per
  surfaces array (WeakMap), as `writing.mjs`'s `relatedIndex`.
- `relatedTools`: the tiers stay (sub-group, category, rest) as a bonus of
  `RELATED_TOOL_TIER_BONUS` = 5 per tier, added to the overlap score; ties keep the old rotation
  order. With no overlap the old order is unchanged (the existing tests pass untouched).
- `relatedToolsTable(surfaces, limit)`: every tool's list, then the orphan pass (each tool no
  footer links to takes the last slot of the first tool in its own top 20 that shares a word with
  it and whose last entry has 2+ inbound links).
- `addSiteChrome` uses the table.
- `platform/pages/related-tools.test.mjs`: 5 tests.

## Measured

`relatedTools` old vs new over the 1,378 surfaces in `dist/catalog.json` (names plus the
catalogue's truncated descriptions; the build uses full descriptions, so the built footers differ
slightly). Script was a throwaway in the run, not committed.

| | before | after |
|---|---|---|
| links sharing no scored word with their page | 2,974 / 5,512 | 14 / 5,512 |
| tools with no inbound footer link | 36 | 1 |
| max inbound footer links to one tool | 13 | 18 |
| time for all 1,378 lists + orphan pass | — | ~2.4 s |

Bonus sweep (0 / 3 / 5 / 8 / strict tiers): zero-overlap links 0 / 5 / 14 / 35 / 37. 0 lets an
"Entry Door" bid reach AI Bookkeeper's list through a shared description word; 5 keeps the category
unless an outside tool shares about one rare name word more.

Built site (full build of this branch, footers parsed from `dist/<slug>/index.html`): 5,512 links
on 1,378 tools, **0 tools with no inbound link, max 16**. `check.mjs`: 10,838 pages, no dead links.
Vendor Watch: vendor-change-watch, vendor-change-evidence, 1099-vendor-tracker, public-record-watch.
Mann-Kendall: extreme-value-analysis, stl-decomposition, kalman-smoother, gaussian-process-regression.
eBay fees: ebay-transaction-report-analyzer, where-to-sell-calculator, print-on-demand-profit-calculator,
ebay-file-exchange-check. AI Bookkeeper: paypal/square/youtube-adsense/payoneer `-to-journal`.

## Still weakest, and what I would do next

1. **AI Bookkeeper is filed under "Compliance checks & evidence records"** while the bookkeeping
   tools sit in back-office. Its footer is fine now (the journal converters win on overlap), but the
   hub card and category page still file it there. A `CATEGORY_RULES` move.
2. **The hub's category pages and "See also" blocks** may use their own picks; they could share
   `relatedToolScore` (grep `categoryFor(` callers that build link lists).
3. **Stems are crude** (`-er` strip makes "corner" and "corn" meet). A short exception list, or
   matching on name words only for the stem rule, if a bad pair turns up.
4. Carried over: "Need this tool to do more?" on ShootFlow docs pages; `cardName` vs `toolName`.
