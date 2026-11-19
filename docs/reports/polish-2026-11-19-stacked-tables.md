---
kind: polish
topics: [design, accessibility]
date: 2026-11-19
---
# Polish, 2026-11-19: wide blog tables stack as cards on phones (shared `.stack` in pf-site.css)

Track: polish/0. PR #17509. Picked item 1 of `polish-2026-11-19-ask-page.md` ("Other wide tables
on prose pages ... the `.stack` pattern could move into the shared stylesheet (`pf-site.css`) as
an opt-in class, with a static check that a `.stack` table labels every cell").

## What I measured first

Every page under `/writing/` with a table (1,597) plus `/custom-development/` and `/about/`, at
390×844 in Chromium over the built site. 1,760 top-level tables. A table "overflows" when it is
wider than its scroller (`.scroll`, 358 px), so some columns are out of sight until the reader
swipes sideways inside it.

| columns | tables | overflowing |
|---|---|---|
| 2 | 255 | 0 |
| 3 | 749 | 1 |
| 4 | 430 | 11 |
| 5 | 175 | 54 |
| 6 | 51 | 44 |
| 7+ | 100 | 99 |

The thresholds came from the first 1,254 tables measured (matched to their HTML): of 350 four-column
tables, the 23 averaging 18+ characters a cell had 6 overflows, the other 327 had 2. No page scrolled sideways as a
whole: `.scroll` already contained every table. The defect was hidden columns, not page reflow.
`/custom-development/` already has its own phone card layout (`.cd-table`); `/about/` has no table.

## What changed

- `platform/devlog/markdown.mjs`: tables go through `renderTable`. `stackTable(cols, rows)` says
  stack when 5+ columns, or 4 columns averaging 18+ characters a cell, and at most 15 rows (a long
  data table keeps its sideways scroll; thirty cards compare worse). A stacked table gets
  `class="stack"`, the ARIA table roles, and `data-label` on every body cell from its header's
  text. When the non-title cells average under 10 characters (scores, counts) it also gets
  `compact`.
- `platform/pages/site-nav.mjs`: `STACK_TABLE_CSS`, in `pf-site.css` (every site-owned page),
  all under `max-width:600px` and scoped to `table.stack`. One bordered card per row, first cell
  as title, label / value pairs; `.compact` sets the pairs two to a line (flex-wrap, 9.5em basis).
- `platform/pages/assistant.mjs`: /ask/'s own copy of the rules removed; it links `pf-site.css`.
- Tests: `platform/pages/stack-table.test.mjs` (labels match headers in order and are
  attribute-escaped, thresholds, long tables untouched, every CSS rule scoped to `table.stack`
  inside the phone media query); `assistant.test.mjs` now checks the shared stylesheet.

## Measured (390×844, 1,760 tables on 1,599 pages)

| | before | after |
|---|---|---|
| tables wider than their scroller | 209 | 5 |
| ...of those with 5+ columns | 197 of 326 | 0 |
| tables stacked | | 356 on 350 pages (build A); 360 on 354 (build B) |
| height of those 360 tables | 150,614 px | 262,927 px (median ×1.76) |
| same 356 tables, one pair per line (build without `compact`) | 149,522 px | 378,094 px |
| 9-column audit score table (`quality-audit-round-72`) | 262 px, 3 of 9 columns visible | 833 px, all 9 |
| pages wider than the viewport | 0 | 0 |
| 1280 px: tables whose width or height changed | | 0 of 1,760 |

Two builds were measured. Build A (one pair per line, the committed `stackTable` rule) stacked 356
tables on 350 pages and gave the overflow count of 5. Build B added `compact` but, through an
intermediate edit, computed the four-column wordy mean without the first column: it stacked 360
tables on 354 pages (305 compact) and left 6 overflowing. The committed code is build A's rule
plus `compact`; I did not spend a third 20-minute build to re-measure the difference (a handful of
four-column tables). Heights in the table are build B's for "after" and build A's for the
one-pair-per-line row.

Screenshots: `img/polish-2026-11-19-stacked-tables-{before,after}-390.jpg` and
`-after-390-dark.jpg` (quality-audit-round-72, light and dark).

## Still weakest, and what I would do next

1. **The remaining overflows (5 in build A, 6 in B) are 3- and 4-column tables 1 to 46 px too
   wide.** Each has one long unbroken word in a ~115 px column: `insurance-commission-reconciler`,
   `MATPOWER-convention`, `Bookkeeping-liable`, `backreference,`, `compounded)`, `accessibility`.
   `overflow-wrap:anywhere` on post `td` would fit them, but it also changes every table's
   min-content width, so auto layout may then break words mid-way in tables that fit today:
   measure all 1,760 before and after. `hyphens:auto` (with `lang="en"`) is the gentler try.
2. **Tables over 15 rows with 5+ columns keep the sideways scroll.** A sticky first column
   (`position:sticky;left:0`) would keep the row name visible while swiping.
3. **Venture pages and research pages render tables with their own CSS**, not `pf-site.css`. The
   same class could be offered through `pf-chrome.css`; measure research project pages first.
4. Carried over from the ask-page report: a browser check that clicks /ask/'s example questions.
