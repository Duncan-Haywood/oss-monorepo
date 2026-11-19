---
kind: polish
topics: [design, accessibility]
date: 2026-11-19
---
# Polish, 2026-11-19: blog tables on small phones (cell padding and hyphenation)

Track: polish/0. PR #17627. Picked item 1 of `polish-2026-11-19-stacked-tables.md` ("the remaining
overflows are 3- and 4-column tables 1 to 46 px too wide ... `hyphens:auto` is the gentler try").
`polish_queue.py` showed it unclaimed; no open polish PR touched `/writing/`.

## What I measured first

Every built `/writing/` page with a table (1,663 pages, 1,829 top-level tables), Chromium over a
full local build of main, a table "hidden" when its `scrollWidth` is wider than its scroller.
The last report measured only 390 px. The defect is much larger on smaller phones:

| width | tables hiding a column (before) |
|---|---|
| 390 | 6 |
| 360 | 31 |
| 320 | 190 (158 of the 448 four-column tables, 31 of 783 three-column) |

Cause: post cells had `padding:7px 10px`. In a four-column table at 320 px that is 80 px of a
288 px box, and one word like "(extrapolated)" in a header then sets a column's minimum width.

## Trials (CSS injected into the built pages, all 1,829 tables at 320 px)

| rule under `max-width:420px` | hidden at 320 |
|---|---|
| none (main) | 190 |
| `th,td{padding:6px}` | 48 |
| + `hyphens:auto` | **12** |
| + `overflow-wrap:anywhere` | 0 |

`overflow-wrap:anywhere` was rejected: the 12 left are mostly figure tables (`$2,853.20`,
`851,778`, `case2000_goc`) whose numbers would then split across lines. Sideways scroll is the
right behaviour for those. Hyphenation never splits digits.

## What changed

- `platform/pages/writing.mjs`: `PHONE_TABLE_CSS`, `@media (max-width:420px) { th, td {
  padding:6px; hyphens:auto } }`, placed after the base cell rule in every post and index page.
  Pages already declare `lang="en"`, which hyphenation needs. Stacked tables (`table.stack`) keep
  their own, more specific padding.
- `platform/pages/post-table-phone.test.mjs`: the rule stays phone-only, keeps hyphenation, never
  adds `overflow-wrap:anywhere`/`word-break`, and follows the base rule in a built post.

## Measured on the rebuilt site (same 1,829 tables)

| width | hidden before | hidden after | total table height before | after |
|---|---|---|---|---|
| 320 | 190 | 12 | 972,951 px | 901,637 px (-7.3%) |
| 360 | 31 | 1 | 792,389 px | 732,328 px (-7.6%) |
| 390 | 6 | 0 | 739,209 px | 690,421 px (-6.6%) |
| pages wider than the viewport | 0 | 0 | | |

At 1280 px nothing changes by construction (the whole rule is inside `max-width:420px`); I did
not re-measure desktop.

Screenshots at 320 px: `img/polish-2026-11-19-phone-table-cells-{before,after}-320.jpg`
(`who-watches-the-weeding-robot`: before, the fourth column is cut off at "nev", "abo";
after, all four show).

**The cost, honestly:** hyphenation also breaks some words in tables that would fit without it
(the screenshot's first column shows "ro-bots", "ma-chine"). That is ordinary phone typography
in Safari and Chrome and the tables are shorter, but it is a visible change. I did not count how
many already-fitting tables now hyphenate.

## Still weakest, and what I would do next

1. **The 12 at 320 px** are numeric tables of 4 columns (`trusses-for-a-small-shed`,
   `permit-feeds-what-they-hold`, `e-invoicing-deadlines-next-14-months`...). The `.stack` rule
   (5+ columns, or wordy 4-column) could also stack 4-column tables at ≤360 px only; measure
   the height cost first.
2. **Venture and research pages** have their own table CSS, mostly with 10 to 12 px padding.
   The same measurement script (Playwright, `scrollWidth > box.clientWidth`) over `ventures/*`
   and `research/*` pages at 320 would show whether the same rule belongs in `pf-chrome.css`.
3. **The dev log (`platform/devlog/render.mjs`)** has the same `padding:7px 10px` cell rule plus
   `min-width:7em` on doc tables; not measured.
4. Carried over: a browser check that clicks /ask/'s example questions; a browser check over
   `/writing/` table overflow at 320 px (this run's script is ~30 lines and takes 45 s on the
   built site; `fold-check.mjs` is the pattern to follow).
