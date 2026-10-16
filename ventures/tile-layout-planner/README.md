# Tile Layout Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/tile-layout-planner/>

Free, browser-only tile layout planner for installers and DIY. Enter a room,
any cut-outs (tub, island, cabinet) and a tile; pick straight, running bond or
diagonal. It lays out the real tiles, searches starting positions and tile
direction for the layout with the fewest cuts thinner than your limit and then
the fewest tiles, reuses leftover pieces, and shows a to-scale plan, a cut list,
tiles and boxes to order, and a comparison of corner, centred and best-found
starts. Metric or imperial. Nothing is uploaded.

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - exact polygon clipping of every tile against the floor and the
  cut-outs, straight / running bond / diagonal lattices, greedy guillotine
  offcut reuse, the starting-position search, the layout comparison, the cut
  list, and an independent `verifyLayout` check.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-many-tiles-do-i-need.html` - guide with a worked example that the test
  suite recomputes.

**No warranty.** Free and as-is; a planning aid, not construction advice,
installation instructions or a material guarantee. It does not model blade
width, breakage, warp, lippage, shade matching, trims, slopes, herringbone or
other patterns, or adhesive and grout quantities. Diagonal offcuts are not
reused, so diagonal counts are conservative. Unverified against a real
installation: tested on hand-computed layouts and on random rooms whose pieces
are checked to add up to the floor.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
