# Polish 2026-11-14: drop-downs in responsive grids get columns wide enough for their choices

Picked from `polish-2026-11-14-select-span.md`, "Still weakest" item 2 ("three- and four-column
grids ... 229 cut choices remain at 1,280 px repo-wide"). No open PR touched it (searched open PRs
for `polish`, `select`).

## What was wrong

Measured on `ventures/` at 1,280 px in Chromium (every venture whose `index.html` has a
`<select>`; the longest choice of each visible single-line select against its box, as
`select-clip.mjs` measures, less 20 px for the arrow): **442 selects on 243 tools** had a choice
cut under the arrow. 280 of them sat in a four-column grid, 54 in five, 33 in six; 36 in two.
Nearly all the 3+ column ones were the same pattern:

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }

(63 tools at 220 px, 59 at 210, 25 at 200, a few at 150 to 190). On a laptop that is four columns
of 228 px, about 186 px of text per select. "Send away or rebook (no revenue, goodwill cost)" read
"Send away or rebook (no r"; "Month Airbnb paid (cash basis)" lost its basis.

Screenshots (built site with the shared chrome, 1,280 px, the grid only):
`img/polish-2026-11-14-select-track-appointment-overbooking-optimizer-1280-before.png` / `-after.png`,
`img/polish-2026-11-14-select-track-airbnb-payout-to-journal-1280-before.png` / `-after.png`.

## What changed

New `platform/pages/select-track.mjs` (+ `select-track.test.mjs`, 8 tests). Per page, for each
**auto-fit/auto-fill** grid of three or more columns holding a cut select, it raises that grid's
track minimum to what the longest choice needs (text + padding + border + arrow + whatever the
grid item adds) and writes it into the venture's `<head>` between `<!-- select-track:start -->`
and `<!-- select-track:end -->`:

    @media (min-width: 740px) { div.grid:has(#split) { grid-template-columns:
      repeat(auto-fit, minmax(min(100%, 266px), 1fr)); } }

Why this and not `select-span.mjs`'s full-row span: in a four-column grid a full-row span is
heavier than the problem, and `span 2` leaves a hole whenever the field lands in the last column
(only `grid-auto-flow: dense` fills it, and that makes visual order differ from tab order). Raising
the minimum keeps every field in place and in order, with no holes, and the grid still reflows at
every width: it shows three (or two) columns where it showed four.

Guards, all checked in the browser before anything is written:

- **Phones keep their layout.** The media query starts at the narrowest tested viewport (320 to
  1,280 px in 20 px steps) from which the page's own grid always has two or more columns, so a
  page's `@media (max-width: 720px) { .grid { grid-template-columns: 1fr } }` still wins below it.
  Then, with the rule applied, at every one of those 49 widths the grid must have **no more**
  columns than before; a grid that fails is left out (none failed).
- **The cut selects fit afterwards** at 1,280 px, or the grid is left out.
- **One long choice doesn't turn a form into a list.** A choice whose track would leave the grid
  one column at 1,280 px stays cut (it wants a shorter label), and the grid is widened only for its
  other cut choices. My first pass took the max over the grid and so skipped 12 tools whose grid
  had one such choice (changepoint-detector's seven selects among them); the per-choice rule picked
  them up.
- Fixed `repeat(3, 1fr)` rows are left alone (they usually mean "these go together"), as are rows a
  script builds in an empty host (the rows-reserve hosts; those want row-cards).
- Selector `div.grid:has(#id)` keyed to a select in the grid, checked to match exactly that grid;
  without `:has()` the rule is dropped and the old layout stays.

Ran `node platform/pages/select-track.mjs --write`: **178 tools** got a block.

## Numbers

Cut selects (longest choice wider than the box), every venture with a select:

| width | before | after |
|---|---|---|
| 1,280 px | 442 on 243 tools | 149 on 82 tools |
| 390 px | 408 | 403 |

At 1,280 px by grid column count, before → after: 4 cols 280 → 30, 5 cols 54 → 23, 6 cols 33 → 4.
Two-column grids went 36 → 51: those are the over-long choices in grids that went from four
columns to two, still cut, now counted under two. The 390 px count moving at all is a side effect
of grids that were two columns at 390 now being one (fewer columns is allowed; more is not).

Checks: `node --test 'platform/pages/*.test.mjs'` 1,626 pass, 0 fail (26 skipped);
`node platform/pages/check.mjs` on `dist/` with the blocks patched in: publishable, no dead links;
every changed venture's own `*.test.mjs` passes (shed-designer's full suite, 514 pass, needs
more than the 120 s tool timeout; run it in the background).

## Still weakest, and what I would do next

1. **149 choices still cut at 1,280 px** on 82 tools. By kind: over-long choices (wider than half a
   form, e.g. eudr-scope-checker `role` 842 px, eu-dora `entity` 831 px): only a shorter visible
   option with the gloss moved to a hint line fixes these; check tests and guides that quote the
   option text. Script-built row templates (`.surface-row`, `.svc-row`, `.pile-row`,
   `.group-row`, `.slab-row`): the row-cards block. Fixed `.row3`/`.row4`/`.fields` grids: judge per
   page.
2. **Phones: 403 cut at 390 px.** The select is already full width; same shorter-label fix as 1.
3. Re-run `node platform/pages/select-track.mjs --write <slug>` (and `select-span.mjs`) after
   changing a tool's options or grid; the block says so. Not in CI (needs Playwright).
