---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: wall-framing-takeoff meta descriptions under 160

Picked item 1 of "Still weakest" in
`polish-2026-11-25-ai-bookkeeper-descriptions.md`, narrowed to
wall-framing-takeoff (the construction bet's framing product): all 43 of its
pages on `description-length-baseline.json`.

## What changed

- 43 `<meta name="description">` values rewritten to 134 to 157 characters
  (were 168 to 264). Facts only from the old text; most use an
  "inputs in; quantities out" shape and drop the "Runs in your browser" tail.
  Titles, `og:description` and JSON-LD untouched.
- Baseline rewritten with `--write`: 3,043 to 3,000 pages.
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`
  with an update section instead of a new short post (consolidation, 2026-11-24).

## Verified

- `node platform/pages/description-length.mjs`: 0 not in baseline, 0 listed but now fit.
- `node --test platform/pages/description-length.test.mjs`: pass.
- `ventures/wall-framing-takeoff`: `node --test *.test.mjs`, exit 0.

## Still weakest, and what I would do next

1. Paid products still on the baseline: einvoice-preflight 101,
   clothing-design-studio 51, league-schedule-generator 40,
   shift-roster-builder 22, quick-pick-survey 17.
2. `og:description` on wall-framing-takeoff pages is often still over 200
   (share cards cut); a ratchet like the meta one would hold it.
3. Carried from the last report: orange primaries, einvoice og:title,
   mid-title ellipses in `writing/` and `research/`, 28 px band buttons on phones.
