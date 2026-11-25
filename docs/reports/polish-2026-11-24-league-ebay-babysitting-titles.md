---
kind: polish
topics: [seo]
date: 2026-11-24
---
# Polish 2026-11-24: league, eBay and babysitting titles; no-description to 0

Picked item 1 of "Still weakest" in `polish-2026-11-24-title-ratchet.md`, and
item 3's "17 pages with no meta description".

## What changed

- 14 league-schedule-generator, 8 ebay-fee-calculator and 7
  babysitting-business-kit `<title>`s cut to 70 characters or fewer (53 to 70).
  Facts only from the old titles; `h1`, `og:title` and descriptions untouched.
  Baseline refreshed (`node platform/pages/title-length.mjs --write`).
- `platform/ci/check_title_meta.py`: a `noindex` page no longer counts as
  no-description (it never shows a snippet). Test added in
  `test_check_title_meta.py`. That cleared 9 sample packs.
- 8 internal commercial-viability reports (photo-editing ×5,
  retail-pilot-intel ×3) given `<meta name="robots" content="noindex">`.
- Post: `docs/posts/2026-11-24-league-ebay-babysitting-titles.md`.

## Measured

- `check_title_meta.py`: long-title 1,088 → 1,059; no-description 17 → 0.
- Venture suites for the three ventures and `platform/pages/title-length.test.mjs`:
  results in the PR's notes.

## Still weakest, and what I would do next

1. **auto-repair-effective-labor-rate (6), s-corp-basis-tracker (6),
   event-seating-chart-optimizer, state-residency-day-counter,
   shopify-fee-calculator (5 each)**: next largest long-title ventures.
2. The 1,059 are spread thin: a batch over single-title ventures would cut
   the count fastest. Hand-written, facts only from the old title.
3. Wall-framing-takeoff's real proposal letter (`bidletter.mjs`) has no
   viewport meta, so a buyer's proposal opens at desktop width on a phone
   (the sample adds one itself). A one-line product fix.
4. Carried over: og:title on einvoice country guides; `writing/` and
   `research/` mid-title ellipses; a visual pass with screenshots (no polish
   run has done one since 11-13).
