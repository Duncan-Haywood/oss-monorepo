---
kind: polish
topics: [design, accessibility, construction]
date: 2026-11-25
---
# Polish, 2026-11-25: pay-app-guides tables stack on phones; shared `.stack` cells no longer split inline markup

Track: polish/0. Picked pay-app-guides because it is the free front door to bet #1
(pay-app billing, `portfolio/monetization/bets.md`). Its guide pages are what a
subcontractor finds from a search on a phone.

## Measured (Chromium, 390×844, pages served from the venture directory)

| page | main table before | after |
|---|---|---|
| retainage-explained | 457 px wide in a 312 px scroller, Notes column off screen, cells about 92 px | one card per state, nothing hidden |
| how-to-fill-out-a-pay-application | 3 columns about 100 px each, 2,003 px tall | cards, 2,125 px tall |
| schedule-of-values-template | 3 columns, empty "Formula" cells | cards; empty cells hidden |
| conditional-vs-unconditional-lien-waivers | 3 columns about 94 px | cards, 843 → 610 px tall |
| change-orders-schedule-of-values | 326 px in 312 px ("After CO-1" clipped) | compact cards, figures right-aligned |

Desktop (1280 px) page heights are unchanged (3,103 and 1,861 px on the two pages
I checked). The rule sits inside `@media (max-width: 600px)`.

## Shared fix (`platform/pages/site-nav.mjs`, `STACK_TABLE_CSS`)

The site-wide `.stack` cell was `display:grid`, so every inline child became a grid
item: `` `CLAUDE.md`, `prompt.md` `` became four items on two rows. 161 of the blog's
500 stacked tables (158 posts) have a labelled cell that mixes text and markup. This
is an upper bound: it also counts tables where only the first cell, a block title, is
mixed. Cells are now `display:table` with the label as a `table-cell` `::before`, and
the CSS table model wraps the rest into one anonymous cell. Before and after screenshots
were taken of the first table in
`2026-10-24-how-an-ai-agent-fleet-reads-its-instructions.md`, and of a compact table in
`2026-11-22-redteam-a-liability-on-unpaid-leave.md`, which renders correctly after.
New test: `stack-table.test.mjs`, "a stacked cell keeps mixed inline content together".

## Next, for the next polish run

1. **Venture pages cannot use `.stack`.** `STACK_TABLE_CSS` is only in `pf-site.css`;
   venture pages load `pf-chrome.css`. pay-app-guides now carries its own copy (label
   above value) in `style.css`. Moving an opt-in `table.stack` into `pf-chrome.css` would
   let any venture guide opt in. Its rules are scoped to `table.stack`, and no venture uses
   that class today (`menu-engineering-calculator` uses `label.stack`, which is unaffected).
   Measure venture tables that overflow at 390 px first.
2. pay-app-guides' calculator (`index.html`) keeps a sideways-scrolling input table
   (`min-width: 820px`). That is correct for data entry, but the "remove" header shows as
   "REMOV" at desktop width (48 px column). Small fix.
3. Open PR 18798 adds four states to the retainage table. When it merges after this one,
   its new rows need `role="cell" data-label="..."`. The pay-app-guides page test names
   the row that is missing them.
