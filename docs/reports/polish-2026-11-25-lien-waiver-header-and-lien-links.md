---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: lien waiver guide header trimmed, every pay-app header capped, lien tools cross-linked (bet #1)

Follows item 1 and 2 of `polish-2026-11-25-pay-app-calculator-header.md` ("Next").

## What looked weak (measured)

- `pay-app-guides/conditional-vs-unconditional-lien-waivers.html` opened with 10 header links,
  the most of any pay-app page (counted from `nav.guides`; next highest was 6). At 390 px the link
  block was 196 px tall and the first card ("The four kinds") started 675 px down.
- `mechanics-lien-deadline-calculator` linked pay-app-guides only once (its hub), and the waiver
  guide did not link the lien deadline calculator or the waiver checker at all, though they are
  the same reader's next step.
- The `#all-guides` jump target was a hand-placed `<span>` in `index.html` only, so no other page
  could jump to the generated list.

## What changed

- `nav.mjs` writes `id="all-guides"` onto the generated block itself; the span in `index.html`
  is gone, and every page now has the target (`node nav.mjs` rewrote 25 pages, one line each).
- Waiver guide header: 4 neighbours (forms by state, waiver log, paid short, prompt payment) plus
  "All tools and guides ↓". The six links dropped are all still in the bottom block.
- Waiver guide body: one bullet on the lien deadline still running, linking the mechanics lien
  deadline calculator and the lien waiver checker.
- Lien deadline calculator footer: links to the waiver guide, prompt payment laws and the Miller
  Act page (no lien on a federal job).
- `page.test.mjs`: the calculator-only header test is now a check on every page (at most 6 header
  links; the calculator and waiver guide at most 5, with the jump), plus a test for the lien links
  in both directions.

## Numbers (Playwright, local file, Chromium)

| Width | Header link block | First card top | Sideways scroll |
|---|---|---|---|
| 390 px before | 196 px | 675 px | none |
| 390 px after | 80 px | 560 px | none |
| 1280 px before | 52 px | 299 px | none |
| 1280 px after | 23 px | 270 px | none |

The jump link scrolls to the block (scrollY 3868 at 390 px). `node --test` on pay-app-guides and
mechanics-lien-deadline-calculator: 291 pass, 0 fail.

## Still weakest, next

1. Four pay-app pages still carry 6 header links (retainage-explained, prompt-payment-laws,
   how-to-fill-out, change-orders). They pass the cap; trimming them to 4 + jump is optional.
2. `lien-waiver-checker` links pay-app-guides not at all (only the lien calculator and the pay
   application generator). Its waiver guide and forms-by-state page are the natural pair.
3. Carried: og:description ratchet (open PR 18953), non-bet products on the meta description
   baseline, mid-title ellipses in `writing/` and `research/`.
