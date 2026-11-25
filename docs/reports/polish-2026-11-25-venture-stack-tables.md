---
kind: polish
topics: [design, accessibility]
date: 2026-11-25
---
# Polish, 2026-11-25: phone cards for venture tables (`table.stack` in pf-chrome.css)

Picked item 1 of "Next" in `polish-2026-11-25-stacked-cells-and-pay-app-tables.md`:
venture pages could not use `.stack` because `STACK_TABLE_CSS` was only in `pf-site.css`.
The note said to measure first.

## Measured (before)

Full build, Playwright Chromium, 390 x 844, every page with a `<table>` in the 21 products of
`portfolio/monetization/transition.json` plus pay-app-guides, mechanics-lien-deadline-calculator,
lien-waiver-checker and machine-shop-guides. A table counts when its `scrollWidth` exceeds its
box by more than 4 px.

- 99 tables past their box; 98 read-only (no inputs).
- By product: shed-designer 21, einvoice-preflight 20, league-schedule-generator 13,
  shift-roster-builder 10, ai-bookkeeper 5, quick-pick-survey 5, clothing-design-studio 5,
  wall-framing-takeoff 4, changepoint-detector 3, xer-schedule-check 3, ifc-quantity-takeoff 3,
  ids-model-check 2, babysitting-business-kit 2, pay-app-guides 2.
- Many are one-row header tables a script fills (runtime results) or true matrices
  (round-robin grids, pairwise comparison counts) where sideways scroll is right. Record lists
  (one thing per row, wordy cells) are the ones cards fix.

## What changed

- `platform/pages/site-nav.mjs`: `STACK_TABLE_CSS` treats `th[scope=row]` as the card title
  (venture tables name rows that way), adds `overflow-wrap:anywhere` to stacked cells, and a
  new `STACK_TABLE_CHROME_CSS` is the same text with every `table.stack` wrapped in `:where()`.
- `platform/pages/build.mjs`: `renderChromeStyle` appends `STACK_TABLE_CHROME_CSS`; the
  venture page loop runs `labelStackTables` just before `injectReflow`.
- `platform/pages/stack-labels.mjs` (+ test): fills `data-label` from the `<thead>` and adds
  roles for any top-level `table.stack`; skips scripts, comments, nested tables and cells
  already labelled. So a venture opts in with the class alone.
- einvoice-preflight: `e-invoicing-mandates-by-country.html` (1 table),
  `what-does-this-e-invoice-error-code-mean.html` (9; plus a phone rule letting `<code>` in
  value cells wrap) and `build-br-fr-codes-page.mjs` (6; page's `min-width:760px` and nowrap
  first cell lifted under 600 px), page regenerated.
- pay-app-guides `style.css`: its own `.stack` rules pin `width`, `table-layout`,
  `overflow-wrap` and the `::before` sizing so the chrome copy changes nothing there.
- Post: extended `docs/posts/2026-11-25-a-css-grid-split-161-phone-tables-into-fragments.md`.

## Numbers

| Page (390 px) | Tables over, before | After |
|---|---|---|
| e-invoicing-mandates-by-country | 1 / 1 | 0 |
| what-does-this-e-invoice-error-code-mean | 6 / 9 | 0 |
| br-fr-error-codes | 6 / 6 | 0 |

- Document width stayed 390 on all three (the tables scrolled inside their box before).
- Desktop (1,280 px): every td/th box identical before and after on the three pages.
- pay-app-guides, 23 stacked pages: every td/th/tr box identical at 390 and 1,280 px against a
  `--only` preview build of main (the only markup change is `role="rowgroup"` on thead/tbody).
- Cost: br-fr-error-codes' tables went from 46,471 px to 130,461 px tall on a phone (368 rule rows
  as cards). Accepted: each rule is readable without sideways scroll; anchors still work.

## Next, for the next polish run

1. **More opt-ins, one class each**: league-schedule-generator (13), shift-roster-builder
   (10), ai-bookkeeper (5) record tables. Skip matrices and one-row runtime headers. Check the
   page's own `table{min-width}` and `code{white-space:nowrap}`, which beat the
   zero-specificity rules.
2. **peppol-bis-3-1-0-readiness** (147 rows, 5 cols): its table sits between
   `<!-- changes:start -->` markers written by `build-peppol-readiness-page.mjs`; add the
   class there, not in the HTML.
3. **shed-designer** (21) was the biggest count; not looked at which are matrices.
4. pay-app-guides could drop its copy of the card CSS once someone decides label-above vs
   label-beside for venture pages; today it pins its own.
5. Carried: the calculator's "REMOV" header at desktop width; og:title on einvoice country
   guides; mid-title ellipses in `writing/` and `research/`.
