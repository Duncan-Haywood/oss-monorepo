# Polish, 2026-11-26: clothing-design-studio meta descriptions

Picked item 1 of "Still weakest" in
`polish-2026-11-25-einvoice-preflight-descriptions.md`. Item 2 there (an
og:description ratchet) already exists: `platform/pages/og-description-length.mjs`
(limit 200, 795 pages listed). League, shift-roster and the construction
front doors were already off the meta list when this run measured.

## What changed

- 51 `clothing-design-studio` pages: `<meta name="description">` rewritten
  from 172 to 310 characters down to 144 to 160. All static HTML (no generator
  writes the meta line: `buildhub.mjs` and `linkjourney.mjs` fill other
  blocks). Facts only from the old text; hedges kept.
- 5 stragglers from other paid products: `ids-model-check` cobie, editor,
  revision; `photo-editing/site/camera-raw-formats.html`;
  `print-atelier/site/vs-printful.html`.
- Only the meta description changed; `og:description` lines were left as
  they were (none of these pages is on the og baseline).
- Baseline rewritten with `--write`: 2,835 to 2,779.
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`.

## Verified

- `node platform/pages/description-length.mjs`: 0 not in baseline, 0 listed but now fit.
- `description-length` + `og-description-length` tests: 9 pass.
- `ventures/clothing-design-studio`: `node --test '*.test.mjs'` 761 pass, 0 fail.
- `ventures/ids-model-check`: 624 pass, 0 fail. `print-atelier/site`: 50 pass.

## Still weakest, and what I would do next

1. Paid products still on the meta baseline: quick-pick-survey 17,
   babysitting-business-kit 7. Then the free front doors of the bets, by
   traffic (fee calculators lead the list: ebay 24, shopify 21, amazon-fba 20,
   but they are free single-purpose tools and only worth it as front doors).
2. og baseline: saints-by-candlelight holds 178 of 795; the rest are spread
   thin. A paid-product og pass (where-to-sell 7, auto-repair 5) is small.
3. Carried: orange primaries, einvoice og:title, mid-title ellipses in
   `writing/` and `research/`, 28 px band buttons on phones; `table.stack`
   in `pf-chrome.css`.
