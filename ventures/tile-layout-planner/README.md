# Tile Layout Planner

Free, browser-only tile layout planner for installers and DIY. Enter a room,
any cut-outs (tub, island, cabinet) and a tile; pick straight, running bond or
diagonal. It lays out the real tiles, searches starting positions and tile
direction for the layout with the fewest cuts thinner than your limit and then
the fewest tiles, reuses leftover pieces, and shows a to-scale plan, a cut list,
tiles and boxes to order, and a comparison of corner, centred and best-found
starts. Metric or imperial. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/tile-layout-planner/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - exact polygon clipping of every tile against the floor and the
  cut-outs, straight / running bond / diagonal lattices, greedy guillotine
  offcut reuse, the starting-position search, the layout comparison, the cut
  list, and an independent `verifyLayout` check.
- `materials()` in `calc.mjs` - grout and thinset estimate: joint volume from the
  laid layout (floor tiled minus tile faces) times tile thickness at ~1.86 kg per
  litre, thinset by trowel notch per m², both plus your extra %, optional bag counts.
- The page keeps your last entries in local storage and has a "Copy share link"
  button; the setup rides in the URL fragment, which no server receives.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-many-tiles-do-i-need.html` - guide with a worked example that the test
  suite recomputes.

**No warranty.** Free and as-is; a planning aid, not construction advice,
installation instructions or a material guarantee. It does not model blade
width, breakage, warp, lippage, shade matching, trims, slopes, herringbone or
other patterns. Grout and thinset are estimates from typical coverage figures; use the coverage printed on your bags. Diagonal offcuts are not
reused, so diagonal counts are conservative. Unverified against a real
installation: tested on hand-computed layouts and on random rooms whose pieces
are checked to add up to the floor.

**See also:** [tile-layout-optimizer](../tile-layout-optimizer/README.md) compares
several tile sizes by box cost and searches brick-bond offsets.

**Privacy.** Everything runs in your browser; your figures are never uploaded.
Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

## Host your own copy

It is a static site: the server only hands out files and never sees a figure you type, so you can serve it from an
address you control.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
