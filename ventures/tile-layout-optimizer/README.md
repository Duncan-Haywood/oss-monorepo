# Tile Layout Optimizer

Free, browser-only tile layout optimizer for tilers, flooring installers and
DIYers. Enter a room, any cut-outs (tub, island, the corner of an L-shaped room)
and one or more tile sizes with box size and price. It searches where the grid
starts, which way the tile runs and how the rows are offset (straight, half or
one-third brick), reuses offcuts by packing the cut pieces into shared tiles, and
shows the layout that needs the fewest tiles without cuts narrower than your
limit. Tile options are ranked by box cost and compared with the 10 percent rule
of thumb and a corner-start layout; the plan is drawn to scale with a cutting list
(CSV). Metric or imperial. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tile-layout-optimizer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - integer geometry (hundredths of a millimetre), the layout search,
  piece generation around cut-outs, a seeded multi-start guillotine packer for
  offcut reuse, purchase maths, drawing and CSV helpers, and an independent
  `verifyPlan` checker.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-lay-tile-with-less-waste.html` - guide with a worked example that the
  test suite recomputes.

**No warranty.** Free and as-is; a planning aid, not legal, tax, financial,
construction or installation advice. It does not model diagonal or herringbone
layouts, tile thickness, out-of-square walls, thresholds, pattern matching, shade
variation or extra breakage; a tile with a bite taken by a cut-out counts as one
whole tile and gives no offcuts. The search is a heuristic, not a proof of
optimality (a lower bound from the area to cover is shown). Prices are only what
you type. Unverified on a real floor: tested on hand-computed rooms and on random
rooms checked for coverage, overlap and cutting.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.
