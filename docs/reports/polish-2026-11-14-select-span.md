---
kind: polish
topics: [design]
date: 2026-11-14
---
# Polish 2026-11-14: drop-downs longer than their column take the whole row (84 tools)

Picked from `polish-2026-11-14-row-cards.md`, "Still weakest" item 3 ("the other bid calculators
... likely share the table layout. Run `select-clip.mjs` and apply the same block"). Running it
showed the other bid calculators' problem is not the row table but the main form: no open PR
touched it (searched `polish in:title`, `select in:title`).

## What was wrong

Most bid calculators lay their main fields out two to a row (`.fields { display: grid;
grid-template-columns: repeat(2, 1fr) }`). At 1,280 px each select is 268 px wide with about
228 px for text, and their choices are written as sentences: "Hang only — slab on the existing
jamb (the cheap special)" (391 px), "Retrofit existing opening — swap the sash and the well (the
cheap special)" (503 px), "Swap only — wax, set, hook the existing supply (the cheap special)"
(455 px). A native select can't wrap, so a laptop visitor read "Hang only — slab on the existing
j" and "80-inch single — the common inte" and had to open each one.

Screenshots (form card at 1,280 px, built site with the shared chrome):
`img/polish-2026-11-14-select-span-interior-door-1280-before.png` / `-after.png`,
`img/polish-2026-11-14-select-span-toilet-replacement-1280-before.png` / `-after.png`.

## What changed

New `platform/pages/select-span.mjs` (+ `select-span.test.mjs`, 6 tests). It opens each venture
at 1,280 px, finds every select whose **longest** option (not only the default) does not fit its
box, and when that select is the only control in an item of a **two-column grid**, writes a
`<!-- select-span:start -->` block into the venture's `<head>` giving that item
`grid-column: 1 / -1`. Decided offline and written into the page, so there is no script and no
layout shift after paint. Details in the file's header; the rules it keeps:

- **No holes.** If a span would leave its left neighbour alone on a row with an empty cell, the
  neighbour spans too. Not `grid-auto-flow: dense`, which would make visual order differ from tab
  order.
- **Phones unchanged.** These grids are one column below ~760 px, where `1 / -1` is a no-op.
- **Left alone:** grids of 3+ columns (a full-row span is heavier than the problem there; the first
  dry run would have spanned 16 fields on changepoint-detector), items holding more than one
  control (it once picked a whole `<section>` on equipment-lease-vs-buy), and rows a script builds
  in an empty host (the rows-reserve hosts: ids like `s1-type` would miss rows a visitor adds).
- Selectors are `div.fields > label:has(> #id)`, checked in the page to match exactly one element.
  A browser without `:has()` drops the rule and keeps today's layout.

Ran with `--write` over all 600 ventures with a select: 84 pages got a block (74 bid
calculators, plus clothing-design-studio, concrete-maturity, continuous-beam-calculator,
earthwork-cut-fill, the facebook-marketplace / grailed / patreon / tcgplayer fee calculators,
invoice-payment-terms-calculator and monastery-site).

## Measured

`select-clip.mjs` (default choice on a fresh load):

| | before | after |
|---|---|---|
| Built site, the 84 pages, 1,280 px | 83 cut on 53 pages | **2** on 1 (clothing-design-studio, a 3-column `.row3`) |
| Built site, the 84 pages, 768 px | 5 on 3 | 2 on 2 |
| Built site, the 84 pages, 390 / 320 px | 45 / 119 | 44 / 119 |
| `DIST=ventures`, all 600 pages, 1,280 px | 308 cut on 183 pages | 229 on 132 |
| `DIST=ventures`, all 600 pages, 390 px | 196 | 195 |

No select was newly cut at any width (set difference before/after: empty; 80 fixed). Sideways
scroll at 320, 390 and 1,280 on the 84 built pages: none before, none after.

The cost is height on a laptop: page height at 1,280 px grows by a median 74 px (max 222, the
pages where four or five fields now take a row). 320 and 390 px: median 0.

Tests: `node --test platform/pages/select-span.test.mjs` 6/6; each changed venture's own
`*.test.mjs` and the site build suite, as recorded in the run record.

## Still weakest, and what I would do next

1. **Phones, 119 cut choices at 320 px on these 84 pages** (and 195 at 390 px repo-wide). The select
   is already the full form width; only a shorter visible option fixes it. The bid calculators'
   pattern is "<what> — <gloss> (the cheap special)": moving the gloss to a hint line under the
   select would fix most at once, but tests and guides quote option text, so check them per page.
2. **Three- and four-column grids** (`.grid` on ~40 compliance checkers and analyzers,
   `.row3`, `.row4`): 229 cut choices remain at 1,280 px repo-wide, most there. These want
   `span 2` with a placement check, or a `repeat(auto-fit, minmax(16rem, 1fr))` track.
3. **Repeated row templates** (painting, pest-control, window-cleaning, pressure-washing, junk
   removal, irrigation winterization): apply the row-cards block from
   `polish-2026-11-14-row-cards.md`.
4. Re-run `node platform/pages/select-span.mjs --write <slug>` after changing a tool's options;
   the block says so. A CI hook would need Playwright, which the repo does not depend on.
