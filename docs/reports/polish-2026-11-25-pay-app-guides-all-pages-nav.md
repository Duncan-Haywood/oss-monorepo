---
kind: polish
topics: [seo, design]
date: 2026-11-25
---
# Polish 2026-11-25: pay-app-guides, one grouped list of every page

Target: the bet #1 front door (`ventures/pay-app-guides`, 15 pages), served at
https://marisstella.app/pay-app-guides/. The description-length baseline
work from `polish-2026-11-25-ai-bookkeeper-descriptions.md` item 1 has moved
on (einvoice and wall-framing done; what is left is non-bet products), so I
screenshotted this front door at 390 and 1280 px instead.

## What looked weak (measured)

- **Orphaned and uneven internal links.** Each page's header linked a
  hand-picked 4 to 11 of its siblings (counted with grep on `nav.guides`).
  The calculator, the hub, did not link `pay-if-paid-clauses.html`,
  `prompt-payment-laws.html` or `lien-waiver-forms-by-state.html`.
- **Clipped header** on the calculator at 1280 px: the 48 px remove column's
  header read "REMOV".

## What changed

- `nav.mjs`: one grouped list (Tools / Billing guides / Getting paid and
  lien waivers), written into every page above the footer as
  `nav.all-guides`, the current page marked `aria-current="page"`. Run
  `node nav.mjs` after adding a page to `GROUPS`.
- `page.test.mjs`: fails if an `.html` file is not in `GROUPS` or a page's
  block is stale. Open PRs that add pages (#18878, #18864 at time of writing)
  will need to add their page and rerun `node nav.mjs` after merging main.
- Remove column header is a visually hidden "Remove line" (`.vh`);
  `.scroll` is `position: relative` so the hidden span cannot widen the page
  (it did: 819 px scroll width at 390 px until that line).
- Header navs left as they were (contextual picks); print still hides all nav.

## Verified

- `node --test` in the venture: 108/108.
- Playwright, 15 pages at 390 and 1280 px: scrollWidth equals clientWidth on
  all 30 (index at 390 was 819 before the `.scroll` fix, never shipped).
- Screenshots of the block at 390 and 1280 px, light and dark, checked by eye.

## Still weakest, next

1. The calculator's header still stacks 11 links above the tool on a phone
   (about 330 px of links before step 1). With the full list now at the
   bottom, the header nav could shrink to 3 or 4 picks.
2. The other bet front doors (`machine-shop-guides`,
   `mechanics-lien-deadline-calculator`) likely have the same uneven
   sibling links; `nav.mjs` is small enough to copy.
3. Carried from earlier notes: og:description length ratchet; non-bet
   products on the description baseline (league 40, clothing 51, shift 22,
   quick-pick 17).
