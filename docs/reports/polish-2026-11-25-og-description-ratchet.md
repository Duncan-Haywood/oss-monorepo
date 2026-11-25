# Polish, 2026-11-25: og:description length ratchet

## What I picked and why

Item 2 of "Still weakest" in `polish-2026-11-25-einvoice-preflight-descriptions.md`
(and the same item in the ai-bookkeeper and wall-framing notes): share-card text
(`og:description`) was still the old long copy, and a catalogue-wide ratchet was
called the better next step than a fifth product-by-product meta rewrite.

## What changed

- `platform/pages/og-description-length.mjs` + test + baseline: venture pages
  with `og:description` over 200 characters (decoded, whitespace collapsed,
  `noindex` skipped). New pages must fit; fixed pages must leave the list.
  Reuses `scan()` from `description-length.mjs`, which now takes a `measure`
  function (default unchanged).
- Measured before: 4,220 indexed venture pages with an og:description; over
  160: 1,430; over 200: 886; over 250: 416; over 300: 230.
- pay-app-guides (bet #1 front door): all 10 of its pages over 200 rewritten
  to 147 to 183 characters, facts only from the old text. Meta descriptions,
  titles and JSON-LD untouched. Baseline 886 to 876.
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`.

## Verification

- `node --test platform/pages/og-description-length.test.mjs platform/pages/description-length.test.mjs`: 9/9 pass.
- `node --test 'ventures/pay-app-guides/*.test.mjs'`: 222/222 pass.

## Still weakest, and what I would do next

1. einvoice-preflight: 80 pages with og:description over 200 (subscription
   product). Its meta descriptions were just rewritten to fit 160; the og text
   can often reuse them or a slightly longer cut.
2. saints-by-candlelight: 178 pages, but it is not a paid product; leave it
   unless it becomes a front door.
3. `twitter:description` is mostly absent; X falls back to og:description,
   so no separate ratchet is needed today.
4. Carried: lien-waivers guide (`conditional-vs-unconditional-lien-waivers.html`)
   still has the longest pay-app header nav; meta descriptions over 160 (2,898);
   mid-title ellipses in `writing/` and `research/`.
