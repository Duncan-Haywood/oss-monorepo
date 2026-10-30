# Shed designer, round 3b lane 1: new shed styles (lean-to)

Session: 2026-10-30. PR #11564.

## What landed

A **lean-to** (single-slope) style, `style: 'leanTo'`, modelled through the whole tool.

`style` is now `'gable' | 'leanTo' | 'gambrel'`. The gambrel is another lane's (PR #11619), and the two share the field and `normalize`.

- **Engine (`model.mjs`).**
  - The wall height is the low back wall's. The front wall is `rise = (W − D) × pitch` taller, so both seats land on plates (`dims.rise`, `highWall`, `highPlateTop`, `walls[name].height`).
  - One rafter a bay runs tail to tail. A birdsmouth on each wall has its back heel at the outside face and its front heel at the inside face. On a connector the rafter rests on the back plate's outside edge and the front plate's inside edge.
  - It has no ridge, beam, ties, trusses, posts or gable vents. A lean-to with a saved `roofType` of `truss` or `ridgeBeam` builds as a lean-to.
  - The end walls are square at the back wall's height. Their cap laps the back wall's top plate and stops against the tall front wall, whose cap runs full length. Raked studs (kind `gable stud`) fill above them, cut to the roof line.
  - Eave blocks and sub-fascia sit at both eaves, with the front soffit running downhill to the wall.
  - Roof sheathing is laid as one plane from the low back eave (`side: 'back'`).
  - Panel siding, lap siding (`layoutFace` with `peakAt` at the front edge) and trim are cut to the slope.
  - `minWallFor` subtracts the rise for front-wall openings. Auto pitch re-sets the walls at each pitch.
  - `wallLabel(design, wall)` gives "Front (tall side)", "Back (low side)", "Left/Right (end wall)".
  - The preset is `PRESETS['8x12 lean-to']`. `STYLE_PRESETS` lists the non-gable presets.
- **Checks.**
  - Rafters are checked as a wall-to-wall simple span (89" clear on 8 ft): 2x6 at 24" is at 72%.
  - Studs are checked at the tall wall's length.
  - There are no ridge or heel rows; `heelJoint` returns null.
  - Connections check "Rafters seat on both walls" and that the end-wall caps reach the tall wall.
  - `utilisation.mjs` follows all of these.
- **Estimate.**
  - One slope of metal panels.
  - A starter strip on one eave and two rakes; drip edge on both eaves and two rakes.
  - No rafter hangers or extra connector nails. This was a real bug: the first build priced hangers when the saved `roofType` was `ridgeBeam`.
  - The vinyl corner post and insulation area allow for the tall wall.
- **Plans (`drawings.mjs`).**
  - Section: two wall heights, one slope, overhang dimensioned at the low tail.
  - Rafter detail: two birdsmouths, both tails, long point to long point.
  - Roof plan: full-length rafters, no ridge.
  - Wall framing: the raked end-wall roof line, and the tall wall's tail band.
  - Exterior elevations: tall side, low side and end walls.
  - Sheathing layout (one slope), nailing schedule and cover sheet.
- **3D labels, build steps (`instructions.mjs`) and editor.**
  - The build steps cover rafter layout from the high tail with both seats, tying the corners at the tall wall, the raked studs, sheathing from the low eave, shingles finished at the high edge, and a double underlayment under 4/12 (IRC R905.1.1).
  - Editor: the plan view has no ridge line; the end view draws one slope with the pitch handle mid-slope; there is a Shape box and a New design menu entry.
- **Design search (`designsearch.mjs`).**
  - A `style` knob, tried last from each design.
  - Lean-to seeds, only when the budget is at least 20 evaluations a size.
  - Two new layouts with every opening in the tall front wall (`FRONT_WALL_LAYOUTS`), seeded for lean-tos only.
  - The lean-to front is refined with the budget left once the whole front is expanded.
  - `storageOf` counts the open wedge.
  - `looksOf` gives a single slope full pitch marks from 3/12 to 5/12, and scores the walls on the mean of the low and tall walls.
  - A lean-to's `roofType` is pinned, so a roofType flip is not a second design.
- **Other modules.** `candidates.mjs` (the gable is the lean-to's alternative), `simplify.mjs` (no roof-structure swap on a lean-to), `designfacts.mjs` (headroom, roof frame, open) and `renders.mjs` (alt text). Pictures for the preset are in `renders/`.

## Numbers

Tool estimate at the shipped dated prices, 12 ft haul limit, before tax.

- **8x12 lean-to (6 ft back wall, 4/12):** $2,900.90, against $3,074.14 for the default gable. That is $173 less for 699 against 692 cu ft. Its rafters are 10 ft boards, and nothing in it is longer than 12 ft.
- **2,000-design search under 100 sq ft:** 37 of the 68 designs on the Pareto front are lean-tos. The most-storage pick (10x10, $2,885.05) and the best-looks pick are lean-tos. The cheapest design is still a ridge-board gable ($2,267.88), and the cheapest lean-to on the front is $2,611.51.
- Post: `docs/posts/2026-10-30-a-lean-to-shed-framed-and-priced.md`.

## Verification (runners starved, so local)

- `node --test *.test.mjs` in the venture, with Playwright from `$(npm root -g)/playwright/index.js`, after the last merge of `main` (095a7a44): **343 pass, 0 fail**.
  - `leanto.test.mjs`: 11 tests, including 48 seat, overhang, stud and footprint combinations that come out integrity-clean with every connection holding, and the search test.
  - `browser.test.mjs`: the lean-to preset, Shape box and end-view test.
- `node platform/pages/typecheck.mjs shed-designer`: 44 files, 0 diagnostics.
- `node make-renders.mjs --check`: all up to date.
- A seeded sweep of 400 random lean-to designs (sizes, pitches, walls, seats, overhangs, foundations, sidings, roofs, random openings) through `fuzz.test.mjs`'s `invariants()` (finite geometry and prices, integrity, connections, SVG and DXF, build steps, solids) broke nothing. The 200-design repeat after the last merge also broke nothing.
- I read the sheets and the 3D view by eye in headless Chromium: section, rafter detail, end-wall framing, front wall, elevations and sheathing.

## Open, and the next step

- **Saltbox.** Not started. It is a gable with the ridge off centre, one long low slope at the back and a short steep one at the front. The lean-to work makes most of it mechanical:
  - per-wall heights (`wallH`, `walls[name].height`);
  - per-side rafter profiles;
  - a monotonic or two-segment top line for the end-wall siding, lap courses and rake (`clip`, `layoutFace.top`, `peakAt`);
  - the per-style branches in drawings and the search.

  The ridge's position and the two pitches are the new inputs. The ridge board or beam then carries unequal reactions, so the beam check needs both slopes' tributaries.
- **The search's looks score is ours.** Full marks for a lean-to from 3/12 to 5/12 is a rule of thumb. The owner or a designer should look at the lean-to designs it now picks for best looks.
- **Lean-to layouts named "gable door".** The existing layouts' names say "gable" for an end-wall door, which reads oddly on a lean-to. Renaming the layouts is a change to the search's stable API, so it is left for its owner.
- **Clerestory windows.** Windows high in the tall wall are a classic lean-to look and would light a shed against a fence. They are not offered yet.
