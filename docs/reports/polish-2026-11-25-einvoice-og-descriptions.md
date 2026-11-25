---
kind: polish
topics: [seo, open-graph]
date: 2026-11-25
---
# Polish 2026-11-25: einvoice-preflight share cards fit 200

Picked item 1 of "Still weakest" in `polish-2026-11-25-og-description-ratchet.md`:
the 80 einvoice-preflight country mandate pages (bet #3, subscription row 1
in `transition.py`) whose `og:description` was over 200.

## What changed

- Each of the 80 pages' `og:description` now equals its
  `<meta name="description">`, which the einvoice description run rewrote
  the same day to fit 160 from the old facts, with each country's hedge kept.
  Before: 201 to 355 characters (median 236). After: 149 to 160.
- Done by a one-off script (raw attribute copied, so entity encoding is the
  page's own); every page had exactly one og:description. No generator owns
  these 80 pages (they are static), so nothing regenerates the old text.
- `og-description-length-baseline.json` rewritten with `--write`: 876 to 796.
- Post: extended `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`.

## Verified

- `node platform/pages/og-description-length.mjs`: 0 not in baseline, 0 listed but now fit.
- `node --test platform/pages/og-description-length.test.mjs platform/pages/description-length.test.mjs`: 9/9.
- `ventures/einvoice-preflight`: `node --test '*.test.mjs'` (result in the run record).

## Still weakest, and what I would do next

1. **Meta = og is a shortcut, not the ideal.** A share card has about 40 more
   characters than a snippet; a later pass could give the top country pages
   (Germany, France, Belgium, Poland, Spain) a card that also names the
   deadline in plain words. Low priority next to the items below.
2. **Paid products on the meta-description baseline**: clothing-design-studio 51,
   league-schedule-generator 40, shift-roster-builder 22, quick-pick-survey 17.
3. **og:title on einvoice country guides** (carried) and `lien-waiver-checker`
   not linking `pay-app-guides` (from `polish-2026-11-25-lien-waiver-header-and-lien-links.md`).
4. Carried: mid-title ellipses in `writing/` and `research/`; `table.stack`
   for venture pages; orange primaries; 28 px band buttons on phones.
