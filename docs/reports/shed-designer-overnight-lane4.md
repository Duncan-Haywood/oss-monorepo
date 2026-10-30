# shed-designer overnight, lane 4: cost honesty, marketing page, llms.txt, SEO

Date: 2026-10-29. Session: https://claude.ai/code/session_01XpHqyeS6gsz3tkQdJ13SA8

## What landed

- **PR #11318: honest prices and numbers.**
  - `sourceLabel()` in `estimate.mjs` is the one label for the page and the CSV. Estimates and scaled prices always say so, even when they link a page.
  - The store comparison and `storeTotals` show a line's own store at the price the line uses. Before, they claimed a $16.80 saving buying T1-11 at Home Depot instead of Home Depot.
  - `estimate().unpriced` names custom-size doors and windows, which are framed but not priced. The "8x12 classic" preset's total leaves out its door and two windows.
  - `marketing.test.mjs` recomputes every `data-fact` number on `shed-plans-with-cut-list.html`, and checks the example in `llms.txt`. It has already caught one drift from another lane's merge: the whole-shed total went from $3,284.59 to $3,272.91.
  - Blog post: `docs/posts/2026-10-29-shed-designer-numbers-that-drift.md`.
- **PR #11411: `main` was red for every PR.** Five things were broken on `main`:
  - `flagships.yaml`: the changepoint-detector `next:` field was over its 2,000-character cap.
  - A blog post linked a `/ventures/` path the site doesn't serve.
  - An ai-bookkeeper page had no `<title>`, share tags or JSON-LD.
  - Four ai-bookkeeper pages had FAQ JSON-LD that differed from the visible answers.

  All are fixed. Lane 5 named three of them from another PR's CI log.
- **This PR.**
  - `recheck_prices.py` and its test.
  - Hemlock drywall tape goes from $7.49 to $9.49, read from the product page.
  - A link to Shed Designer from the shed-install-bid-calculator article, at "stick-built is lumber and more hours".
  - This report.

## What could and could not be re-checked (2026-10-29)

- **Home Depot:** product pages load, but the price is null until a store is chosen. Not readable.
- **Lowe's:** 403. The gravel cost guide (hellogravel.com) is also 403.
- **Menards:** the schema.org Offer price is the value *after* the 11% mail-in rebate; the shelf price is a separate `salePrice` field. Later requests got an Imperva bot challenge. I took no automated readings into the files: big-box terms forbid scraping, and the README already says so.
- **Menards prices a person should check in a browser.** The first readings suggested these moved:

  | Item | File | Reading |
  |---|---|---|
  | 2x10x12 (SKU 1022032) | $25.99 | $24.63 |
  | PT 4x4x12 (SKU 1112265) | $25.72 | $24.58 |
  | PT 2x6x8 (SKU 1111024) | $12.52 | $12.19 |
  | 7/16 OSB (SKU 1242728) | $13.48 | $14.51 |

- **Matched to the cent:** Shed Windows and More (4 windows) and Shed Repair (3 doors).
- **DK Hardware** answered 403 to the script.

## Open, for the next run

- **About 200 listings rest on search-result copies of pages,** many months old (Lowe's copies up to 632 days). A person with a browser and a store selected could refresh the biggest lines first: lumber, siding, shingles, the door. Record the date and the store in each note.
- **Lumber-list pages by size** (PR #11322, `shed-lumber-list-by-size.html` and the per-size pages) are written by the engine and have their own drift check. They are not covered by `marketing.test.mjs`. **Resolved 2026-10-30 (round 2, lane 2):** the size pages are no longer committed; the site build writes them (`platform/pages/build.mjs`, `GENERATED_PAGES`), so there is nothing to regenerate or hand-merge.
- **Usage tracking:** the marketing page has no page-view counter of its own. The tool's `usage.mjs` counts events in the browser only. Check whether the Pages build's site counter (platform/edge) covers SEO pages before adding anything.
- **Custom-size openings** are now named. A next step could offer a typical price range from the catalogue (cheapest to dearest unit of that kind) instead of leaving them out. It must say "range" and never present it as a listing.
