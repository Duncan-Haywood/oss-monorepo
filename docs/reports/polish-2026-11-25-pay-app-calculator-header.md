---
kind: polish
topics: [design, seo]
date: 2026-11-25
---
# Polish 2026-11-25: the pay-app calculator's header no longer hides the tool on a phone

Bet #1's front door is `ventures/pay-app-guides/index.html`, the schedule-of-values
calculator. Its header listed 15 hand-picked guide links above step 1. The previous polish
note (`polish-2026-11-25-pay-app-guides-all-pages-nav.md`, "Still weakest, next", item 1)
flagged it once `nav.mjs` put the full grouped list at the bottom of every page.

## What changed

- The header now shows four picks (how to fill out a pay application, the Excel template,
  retainage with state caps, the pay app checker) and a bold "All tools and guides ↓" link
  that jumps to the generated `all-guides` block.
- The jump target is a `<span id="all-guides">` just before the generated block's start
  marker, so `nav.mjs` and every other page stay unchanged. That matters because open PRs
  (18915, 18910, 18888) add pages to that block, and this way they don't conflict.
- `page.test.mjs` fails if the header grows past five links or the jump target goes missing.

## Measured (local file, Playwright Chromium, page without the site chrome)

| Viewport | Top of step 1, before | After | Sideways scroll |
|---|---|---|---|
| 390 × 844 | 844 px (exactly the fold: none of the tool visible) | 584 px (first two inputs visible) | none, before or after |
| 1280 × 800 | 430 px | 372 px | none |

Screenshots: `img/polish-2026-11-25-pay-app-header-390-before.png` and `-after.png`.
None of the 15 removed links is lost: every one is still in the all-guides block on the same page.

## Checked and not needed

- "REMOV" header (item 2 of the stacked-cells note): the remove column's header is already a
  visually hidden "Remove line", and each row's button is "×". It was fixed before this run.
- Sibling links on `machine-shop-guides`: all 12 pages already link the same 12 pages, so
  copying `nav.mjs` there would add nothing today.

## Next, for the next polish run

1. The lien-waivers guide (`conditional-vs-unconditional-lien-waivers.html`) still opens
   with 10 header links, the most of any pay-app page now. Trim it the same way after
   measuring at 390 px. Every other page has 6 or fewer.
2. `mechanics-lien-deadline-calculator` links to pay-app-guides only once. Check that it
   reaches the waiver and prompt-payment pages, its natural neighbours for bet #1.
3. Carried over: og:description length ratchet; meta descriptions over 160 characters.
