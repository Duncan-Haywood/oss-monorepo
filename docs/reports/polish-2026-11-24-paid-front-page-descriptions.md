---
kind: polish
topics: [seo]
date: 2026-11-24
---
# Polish 2026-11-24: paid-product front-page meta descriptions + a ratchet

Picked item 2 of "Still weakest" in `polish-2026-11-24-card-sentences.md`
(carried in `polish-2026-11-24-bar-tone.md`): meta descriptions a results page
cuts. Narrowed to the 20 `proprietary` products in
`portfolio/monetization/transition.json`, per the North star (paid products
first). Item 3 of `polish-2026-11-24-league-ebay-babysitting-titles.md`
(bidletter viewport) had already landed: `bidletter.mjs:88` has the meta.

## What changed

- 18 meta descriptions rewritten to 129 to 160 characters (were 178 to 355):
  the 16 product front pages that have one, plus the two einvoice-preflight
  guides over 320 (Portugal, Taiwan) that the build was cutting with "…".
  Facts only from the old text; `og:description`, JSON-LD, titles untouched.
  local-site-studio and ig-media-pipeline have no public page; retail-pilot-intel
  was already 155; einvoice-preflight's front page was already 155.
- `platform/pages/description-length.mjs` + `.test.mjs` +
  `description-length-baseline.json`: same shape as `title-length.mjs`.
  Every venture page with a description over 160 (decoded, `noindex` skipped)
  must be on the baseline; a listed page that now fits must leave it
  (`--write`). 3,841 before, 3,823 after. Runs via the `"*.test.mjs"` step in
  `portfolio-pages.yml`.
- Post: `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`.

- After merging main: 5 new machine-shop-guides pages (164 to 178) were
  shortened to 148 to 159 instead of baselined, so the baseline stays at 3,823.

## Verified

- `node --test platform/pages/description-length.test.mjs`: 5/5.
- `run_venture_tests.py` on the 17 touched ventures: see the run record notes.

## Still weakest, and what I would do next

1. **The rest of the paid products' pages**: 340 of their 402 indexable pages
   are still over 160 (einvoice-preflight 101, clothing-design-studio 51,
   ai-bookkeeper 46, wall-framing-takeoff 43, league-schedule-generator 40).
   Filter `description-length-baseline.json` by slug for the list; same
   approach, then `node platform/pages/description-length.mjs --write`.
2. **og:description** on the same front pages is often the old long text;
   share cards cut at about 200. A matching ratchet could follow.
3. Carried: the 4 orange primaries (`polish-2026-11-24-bar-tone.md` item 1);
   og:title on einvoice country guides; `writing/` and `research/` mid-title
   ellipses; band buttons 28 px tall on a phone.
