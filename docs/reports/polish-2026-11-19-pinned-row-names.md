---
kind: polish
topics: [design, accessibility]
date: 2026-11-19
---
# Polish, 2026-11-19: wide tool tables keep their row names in view on a phone (sticky first column)

Track: polish/0. PR #17543. Picked item 2 of `polish-2026-11-19-stacked-tables.md` ("Tables
over 15 rows with 5+ columns keep the sideways scroll. A sticky first column would keep the row
name visible while swiping").

## The item was aimed at the wrong pages

I built the blog version first (a `.pin` class from `platform/devlog/markdown.mjs` on every
unstacked table of 4+ columns) and measured it before keeping it. At 390×844 over the built site,
1,312 `/writing/` pages: 406 such tables, **4** wider than their scroller, each by a few pixels,
and **0** whose first column left the screen when swiped to the end. The stacking change (PR #17509)
had already dealt with the wide blog tables, and no long 5+ column table on the blog still
overflows. So I reverted it (the revert is in this PR's history) rather than ship a no-op.

Then I swept every other built page with a `<table>` (1,156 pages: tool pages, research apps,
`/engineering/`), same width, waiting for `load` plus 250 ms so the calculators had filled their
tables. That is where the defect is: the tool pages' result and input tables, in the
`.pf-table-scroll` box `reflow.mjs` puts around every table.

## What changed

- **`SCROLL_A11Y_SCRIPT` (build.mjs, shipped in `pf-site.js`).** New `pin(el)`, run on every width
  check of a box that is really scrolling. It sets `data-pf-pin` on our own `.pf-table-scroll`
  box when: the box holds just a table; the table still lays out as a table (a venture's own
  phone card layout, `display:block` rows, is left alone); no first-column cell spans rows; the
  first column (its first non-spanning cell) is at most half the box. It copies the nearest
  painted background above the table into `--pf-pin-bg` once. Re-checked every width check
  because calculators fill tables after load, so the first column only gets its real width then.
- **`REFLOW_CSS` (reflow.mjs, in `pf-chrome.css`).** For `[data-pf-pin]`: first cells
  `position:sticky;left:0;z-index:1` with an inset 1 px edge shadow (a collapsed border does not
  travel with a sticky cell); body cells get `background-color:var(--pf-pin-bg,Canvas)`; header
  cells get it at zero specificity, so a venture's shaded `<th>` keeps its shade. Cells with
  `colspan` (section heading rows, "no rows yet" rows) just scroll. Print turns it off.
- **Ordinary specificity, on purpose.** The first try wrapped everything in `:where()`. On
  shed-designer the pinned cells were transparent, so the swiped columns showed through the row
  names: ventures' own `td{background:…}` rules beat a zero-specificity rule. A second bug was mine:
  the "is this background transparent" regex lost its backslashes inside the template literal, so
  `rgba(0, 0, 0, 0)` was copied as the background. The sweep now checks every pinned cell's computed
  background: **0 transparent** of 160 tables.
- **bounce-house-rental-calculator.** Its phone card layout was 22 px wider than its box
  (`width:100%` plus padding and border), so each card's left edge was cut once swiped. Added
  `box-sizing:border-box`; the box no longer scrolls.
- Tests: `build.test.mjs` runs the real `pf-site.js` against a stub page (the existing
  `scrollPass` harness): a narrow-first-column table is pinned with the card's background (the
  transparent box skipped); a wide first column, a card-layout table and a row-spanning cell are
  not; all four still get their tab stop. `reflow.test.mjs` checks the rules' specificity, the
  tbody background and the print reset.

## Measured (390×844, Chromium, built site, the 100 pages with an overflowing table)

| | before | after |
|---|---|---|
| tables wider than their scroll box | 188 | 189 (bounce-house then fixed: 188) |
| ...in `.pf-table-scroll` | 175 | 176 (175) |
| `.pf-table-scroll` tables whose first column leaves the screen at full swipe | **104 on 61 pages** | **12 on 10 pages** |
| tables pinned | 0 | 160 |
| pinned first cells with a transparent background | | 0 |
| pinned first column as share of the box (median) | | 27 % |
| pages wider than the viewport | 0 | 0 |

The 12 left are tables whose first column is over half the box (marketplace-fee-compare 54 %,
pairwise-ranking's 21×21 matrix 68 %, no-show-fee-calculator 52 to 61 %, …): pinning them would
leave under half a phone for the numbers. The other 7 hidden-first-column tables are not in our
box: `/engineering/` (`.scroll`, two tables) and the marriage-divorce-evidence research app
(`.table-wrap`, five).

"After" was measured by writing the new `pf-site.js` and `pf-chrome.css`
(`renderChromeModule()`, `renderChromeStyle()`) into a full build's dist; the rest of the page
is the same build. Sticky positioning changes no layout, so desktop table sizes are unchanged.

Screenshots (390 px, table swiped to its last column):
`img/polish-2026-11-19-pinned-{shed-designer,sprinkler-hydraulic-calc,wall-framing-takeoff}-{before,after}-390.jpg`.

## Still weakest, and what I would do next

1. **Wide first columns (12 tables).** A first column over half the box isn't pinned. Clamping the
   pinned cell (`max-width:40vw` with wrapping) would need a wrapper inside the cell, because
   Chromium ignores `max-width` on a table cell. Or the ventures could shorten those labels.
2. **`/engineering/` and research apps** use their own scroll boxes (`.scroll`, `.table-wrap`), so
   they don't get the pin. `/engineering/` has a 31-row, 6-column table that loses its row names.
   `platform/devlog/render.mjs` could add the attribute and the same CSS.
3. **Zebra stripes.** A venture that stripes rows with `tr:nth-child(even){background}` loses the
   stripe in the pinned cell (it takes the card colour). I saw none in the screenshots, but I didn't
   check all 160.
4. Carried over: `polish-2026-11-19-stacked-tables.md` item 1 (3 and 4 column blog tables 1 to
   46 px too wide, `hyphens:auto`), item 3 and item 4.
