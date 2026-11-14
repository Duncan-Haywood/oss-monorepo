---
kind: polish
topics: [design]
date: 2026-11-14
---
# Polish 2026-11-14: the bid calculators' row editors stop cutting their own choices

Picked from `polish-2026-11-14-select-clip.md`, "Still weakest" item 1 ("the row-grid bid
calculators ... 34 crushed selects at 1,280 px"). No open PR touched these pages (searched
`polish in:title`, `select in:title`).

## What was wrong

Eight bid calculators (gutter-cleaning, window-replacement, hood-cleaning, carpet-cleaning,
tree-service, snow-removal, flooring, deck) lay out each editable row as a one-line table: 5 to 8
controls side by side in the form column, which is about 600 px wide next to the result panel on
a laptop. The selects got what was left. Gutter cleaning's were 57 px wide with 25 px of room for
text, so a visitor saw `Lo`, `Ope`, `Lea`, `1 st`; window replacement's `Install` showed 31 px of
"Insert / pocket (frame stays)". On phones the rows were already two-column cards, but with fixed
half-width cells, so long choices ("Rooftop — ladder, hatch, or confined") were cut there too.

Screenshots: `img/polish-2026-11-14-row-cards-gutter-cleaning-1280-before.png` / `-after.png`,
`...-window-replacement-1280-before.png` / `-after.png`, `...-hood-cleaning-390-before.png` /
`-after.png`.

## What changed

One block per page, between `<!-- row-cards:start -->` and `<!-- row-cards:end -->` just before
`</head>` (after every other rule, so it wins on source order without new specificity):

- the row becomes a wrapping flex card at every width (the old table header row is hidden, and the
  per-field labels that were screen-reader-only on desktop are now visible);
- each select's label takes its content width (a native select's natural width is its longest
  option), text inputs `flex: 2 1 12rem`, number inputs `flex: 1 1 6.5rem`, checkboxes their own
  width, so the row wraps rather than squeezing a control;
- Remove is a compact button at the end of the card (window-replacement's uppercase `.lbl` style no
  longer leaks into "Remove this opening").

`:has()` picks the input type; a browser without it gives number inputs their default width,
which still wraps and still does not clip. The rows-reserve blocks for the eight pages were
re-measured with `node platform/pages/rows-reserve.mjs --base … --write <slugs>` so first paint
still holds the right height (the cards are taller, so the old numbers would have under-reserved).

## Measured

`platform/pages/select-clip.mjs` with `DIST` pointed at a folder holding the eight ventures as they
are in the repo (before = `git show HEAD:`; the site chrome is not injected, so the counts are for
the tool's own CSS; the 1,280 px "before" figure matches the 34 crushed the full-site run found):

| | clipped selects, before | after | under 90 px wide, before | after |
|---|---|---|---|---|
| 320 px | 39 on 6 pages | 16 on 4 pages | 0 | 0 |
| 390 px | 29 on 6 pages | 1 (tree species, 1 px) | 0 | 0 |
| 1,280 px | 55 on 8 pages | **0** | 34 | **0** |

Sideways scroll at 320, 390 and 1,280: none on seven pages before or after; tree-service is 330 px
wide at 320 both before and after (pre-existing, not this change).

The cost is height: the rows host at 1,280 px goes from 146 to 575 px on gutter cleaning (3 runs),
884 to 1,028 on window replacement (4 openings), 406 to 1,238 on snow removal (8 sites). That is
the price of every choice being readable; the earlier height was only possible because the
choices were not.

Tests: each page's own `*.test.mjs` passes (gutter 90, window 126, hood 126, carpet 125, tree 144,
snow 98, flooring 121, deck 118; 0 failures); `node --test platform/pages/rows-reserve.test.mjs`
4/4; the site build suite as recorded in the run record.

## Still weakest, and what I would do next

1. **Option text longer than a phone** (the 16 at 320 px): carpet-cleaning soil
   "Normal household soil (280 sq ft/h)" (45 px short), hood-cleaning access
   "Rooftop — ladder, hatch, or confined" (53), tree-service species and access (13 to 43). The
   select is already full width, so only a shorter visible option label fixes it (detail into the
   help text). Check each tool's tests and guides that quote the option first.
2. **Snow removal's eight starting sites** make the editor 1,238 px tall on a laptop. Fewer
   starting rows (three, like gutter) would show the method without the scroll; that is a product
   judgement, so check the tool's guide and tests that assume eight.
3. **The same row-card block could be one shared stylesheet.** Eight copies is the repo's current
   pattern (each tool is standalone), but the other 18 bid calculators with rows-reserve blocks
   likely share the table layout. Run `ONLY=<their slugs> DIST=ventures node
   platform/pages/select-clip.mjs` and apply the same block (the injector is described above:
   per page, the row selectors, the header selectors and a border colour).
4. Carried over from `polish-2026-11-14-select-clip.md`: shed-designer (22 clipped) and
   clothing-design-studio (8); the three 19 px sideways pages at 320 px; the shared `.jump`
   component; `MAX_LINKS` 8 → 6.
