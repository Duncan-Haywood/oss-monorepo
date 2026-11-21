---
kind: polish
topics: [design, accessibility, software-for-routine]
date: 2026-11-21
---
# Polish 2026-11-21: figure columns in the tool pages' own tables, right-aligned

Picked item 1 of "Still weakest" in `polish-2026-11-20-number-columns.md`
(venture and research pages' own tables still left-align figures). No open PR
had `polish` in its title.

## Measured first

A static count over the built HTML (outside scripts) found 1,057 figure columns
without a `num` class or inline right-align on 392 pages. That count is
misleading: most ventures right-align by their own CSS, and most result tables
are written at runtime. In Chromium (1280×900, `load` + 300 ms), over the 1,168
non-blog pages with a `<table>`, by computed `text-align` of each figure column's
first figure: **148 left, 678 right, on 42 pages**. `/engineering/` and the
research pages already used `.num`; they had none.

The left ones were concentrated: 25 `*-bid-calculator` comparison tables whose
"Hours" column sat left beside a right-aligned "Price" (`th,td{text-align:left}`
plus `td:last-child{text-align:right}`), plus no-show-fee (17), retainage-cashflow
(10), shift-rotation (7), menu-engineering, commissary, hoa-reserve and a dozen
more with 1 to 4.

## What changed

- `platform/pages/figure-columns.mjs` (new): `FIGURE_COLUMNS_JS`, a `figs(table)`
  that marks cells of a figure column (and the matching header cell) with
  `data-pf-num`, using the blog's `NUMERIC_CELL` (imported, so both stay in
  sync); and `FIGURE_COLUMNS_CSS`: `td[data-pf-num],th[data-pf-num]{text-align:right;
  font-variant-numeric:tabular-nums}`. Skipped: the first column, a column with a
  form control, a table with a row-spanning cell or fewer than two body rows, and
  rows that are not `display:table-row` (venture card layouts; marks come off on
  resize). It caches by row count and text length, so per-keystroke checks are cheap.
- `build.mjs`, `SCROLL_A11Y_SCRIPT` (pf-site.js): `measure()` calls `figs` on
  every table, and a `MutationObserver` per table schedules a width check when a
  calculator fills it with no input event (the bid comparisons are filled after
  load). Rule added to `pf-chrome.css` (`renderChromeStyle`) and `pf-site.css`
  (`renderSiteStyle`, for /ask/).
- Two traps found on the way: (1) the first version required the `<table>` to be
  `display:table`; several ventures set `table{display:block}` to scroll it, and
  the bid comparisons stayed left (148 → 79). Now the row and cell display is
  checked instead. (2) Without the observer, a table filled after load stayed
  unmarked until the first click.
- `figure-columns.test.mjs` (6 tests); `figure-columns-check.mjs` is the browser
  measurement, kept for the next run.

## Measured after (same 1,168 pages)

| Width | Left before | after | Right before | after | Page sideways scroll |
|---|---:|---:|---:|---:|---:|
| 1280 | 148 (42 pages) | 1 (1 page) | 678 | 810 | 0 |
| 390 | n/m | 4 (2 pages) | n/m | 807 | 0 |

The remainders are intended: Wall Framing Takeoff's column holding a control,
and /ask/'s score table, which is a card layout at 390. Screenshots (720 px, 2x):
`img/polish-figure-columns-{before,after}-720.png` (home-elevator comparison).

Suite: `node --test 'platform/pages/*.test.mjs' 'platform/devlog/*.test.mjs'`:
1,934 pass, 0 fail before the last two fixes; the final run is in the run record.

## Still weakest, and what I would do next

1. **Columns of figures with a word in them** ("pneumatic" as the cheapest
   row's "vs" cell, "12 sq ft", "3 crews") are not figures by the blog test and
   stay as the venture set them. A "figure plus one trailing word" rule would
   catch units; measure what else it would catch first.
2. **No ratchet.** `figure-columns-check.mjs` is run by hand. A baseline
   (`venture-fold-baseline.json` is the pattern) would make a new left-aligned
   column visible to every run; registering it in CI is control-plane work.
3. **No-JavaScript readers** see the old alignment: the marks are set at
   runtime. Static tables could also be marked at build time (`reflow.mjs`
   already rewrites every table), but on today's count only the runtime ones were wrong.
4. Carried over: `polish-2026-11-20-number-columns.md` items 2 and 3 (bold totals;
   320 px overflows of four-column figure tables).
