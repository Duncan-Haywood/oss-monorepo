---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: einvoice-preflight meta descriptions

Picked item 1 of "Still weakest" in
`polish-2026-11-25-wall-framing-descriptions.md`: the paid product with the
most pages on `description-length-baseline.json`, einvoice-preflight
(subscription row 1 in `transition.py`), 101 pages.

## What changed

- 101 `<meta name="description">` values rewritten to 139 to 160 characters
  (were 165 to 313). Facts only from the old text; each country page keeps
  its own hedge ("as reported", "sources disagree", "draft").
- Three pages are generated, so the generator changed and the page was
  re-rendered: `deadlines-page.mjs` (counts stay computed),
  `whichapplies.mjs`, `build-sdi-codes-page.mjs`. In the first two the same
  `desc` feeds `og:description`, so those two share cards got shorter too.
  Re-rendering changed only the description lines.
- Static pages: same `'` encoding as the page used (`&#x27;` or raw).
- Baseline rewritten with `--write`: 2,999 to 2,898 pages.
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`
  (update section, `einvoice-preflight` tag) instead of a new short post.

## Verified

- `node platform/pages/description-length.mjs`: 0 not in baseline, 0 listed but now fit.
- `ventures/einvoice-preflight`: `node --test '*.test.mjs'` (result in the run record).

## Still weakest, and what I would do next

1. Paid products still on the baseline: clothing-design-studio 51,
   league-schedule-generator 40, shift-roster-builder 22, quick-pick-survey 17.
   After those, the free front doors of the construction bets.
2. `og:description` is still the old long text on the 98 static
   einvoice-preflight pages (many over 200); an `og:description` ratchet like
   the meta one would hold all products at once. That is the better next
   step than a 5th product-by-product rewrite.
3. Carried: orange primaries, einvoice og:title, mid-title ellipses in
   `writing/` and `research/`, 28 px band buttons on phones; `table.stack`
   in `pf-chrome.css` (from `polish-2026-11-25-stacked-cells-and-pay-app-tables.md`).
