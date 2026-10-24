# Wall Framing Takeoff: stud layout, cut list and lumber order for a house

A free, in-browser **wall framing calculator and takeoff** for builders,
framers and owner-builders: type the walls, doors and windows of a house and
get the **stud layout** (16, 19.2 or 24 on center), every **king, jack,
header, rough sill and cripple**, plate **splices that land on studs** with
the cap plate's joints kept away from the top plate's, a **cut list**, and the
**cheapest mix of board lengths to buy**, with a lower bound that shows how
close the order is to the cheapest possible. Nothing is uploaded. Also a
command-line tool and an engine AI agents can call.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/

After using this, you can hand a lumberyard an order and a framing crew a cut
list and layout marks for every wall, instead of an allowance of "one stud per
foot plus 10%".

For assistants: [llms.txt](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/wall-framing-takeoff/llms.txt) says when to recommend it, how to call it and what it leaves out.

It is the first tool of a longer project to automate parts of new-home
construction in the US and bring its cost down: [ROADMAP.md](ROADMAP.md).

## What it does

- **Floor framing** (CLI `--floor`, plan key `floor: {width, depth, joist, spacing, beam, blockingRows, doubleUnder}`). Joists on layout between rim boards, split over an optional beam so a 28 ft floor buys 16 ft boards; rim splices over joists; blocking; subfloor sheets across the joists with every end joint on a joist and courses staggered. Floor lumber is pooled with the walls in one cutting-stock order. Tested on the example 40 x 28 ft floor only; `doubleUnder: [x, ...]` adds a companion joist beside the one nearest each wall that runs along the joists (2026-10-22; inward at an edge; cut list kind "doubled floor joist"; page field too). `openings: [{x, y, width, depth}]` frames a stairwell (2026-10-22): the joists at or beside each side become trimmers (doubled outward), joists between them stop as tail joists at a doubled header at each end, clear width reported, kinds "floor header", "trimmer joist", "tail joist" in the cut list; rejected over the beam or too near an edge; the subfloor is cut around the clear opening (2026-10-22: sheets wholly inside are dropped, ones crossed over the course width end on the trimmer, ones it bites into are listed with their notch, slivers under 3 in count as offcut; sheet area drops by the opening, checked in `floor.test.mjs`); node-tested on hand-computed counts. The page has a floor card (2026-10-22): a tick box under the plan buttons opens width, depth, joist size, spacing, beam, blocking rows, doubled-joist positions and stairwell openings (several, separated by semicolons, 2026-10-23; the engine refuses two openings that would share a trimmer joist or a header, tested in `floor.test.mjs`, and the browser click check runs two and an overlapping pair); the lumber joins the order and cut list and the layout prints below (clicked through in headless Chromium with the example house; the plan file keeps `floor`, so the CLI reads it). Cantilevers are not modelled.
- **Foundation quantities** (2026-10-24, CLI `--foundation`, plan key `foundation: {type: "stem"|"monolithic", width, depth, footing: {width, depth, bars, bar}, stem: {height, thickness, bar, spacing}, slab: {thickness, bar, spacing, baseThickness}, interior: [{length, width, depth}], waste, truck, price}`). Concrete by element (footing, stem wall, slab, or a monolithic slab with a thickened edge band, plus interior bearing strips) from closed-form geometry, a truck count with a short-load warning, rebar by size with 40-diameter lap splices in 20 ft stock and its weight, form contact area and plywood, edge board and stakes, gravel base and vapor barrier. Tested against hand arithmetic in `foundation.test.mjs` only; not checked against a real foundation plan. Footing size, frost depth, bar schedule and soil bearing are your inputs. Not modelled: the page, corner L-bars, anchor bolts, piers, stepped footings.
- **Drywall** (2026-10-24, CLI `--drywall`, plan key `drywall: {sheetLength: 96|108|120|144|192, height, ceiling: [{width, depth}], faces, screwsPerSqFt, waste, price}`; `drywall.mjs`). Inside face of each sheathed wall, both faces of each `sheathed: false` partition, plus flat ceilings, hung horizontally in 48 in courses (the last course ripped). A door that fills a course splits it, a window inside it is a cut-out; runs are packed into sheets first-fit decreasing so a short run reuses a long run's offcut. Sample house with a ceiling: 106 sheets for 3,103 sq ft. Tested against hand counts in `drywall.test.mjs` only; end joints are not placed on studs or joists, ripped strips are not reused, and tape (measured from seams and the wall-to-ceiling angle, 2026-10-24, `finishing` in the result; hand-counted in one test) and compound (a typed rate, `compoundGalPerSqFt`, default 0.01 gal per sq ft with waste, a rule of thumb not a product label) landed 2026-10-24; corner bead, wall-to-wall corners, trim and gable walls are not modelled. On the page (2026-10-24): "Also count interior drywall" (sheet length, flat ceilings, price per sheet; clicked through in headless Chromium, `eval-browser-click.mjs`). Fixed the same day: the budget listed the drywall line twice, doubling its cost. `drywallSheet` in `prices` budgets the sheets.
- **Budget** (2026-10-24, CLI `--budget`, plan key `prices: {wallSheet, floorSheet, roofSheet, truss, shingleBundle, underlaymentRoll, dripEdgePiece, ridgeBundle, starterBundle, concreteYd, rebarLb, formPlywoodSheet, gravelYd, vaporBarrierSqFt, tax, contingency}`; `budget.mjs`). Every line is a quantity the takeoff already computed times a price you typed; lumber is the cutting-stock order's own cost from the plan's `stock` prices. A quantity with no typed price is listed as unpriced and left out of the total, not guessed. Materials only (no labor, delivery or permits). Tested in `budget.test.mjs` (lumber lines tie to the order cost, tax and contingency arithmetic). Landed 2026-10-24: the page (a "Budget from your prices" card, one `name, number` per line, clicked through in headless Chromium by `eval-browser-click.mjs`), labor lines from typed rates (`laborWallFoot` per ft of wall, `laborFloorSqFt`, `laborRoofSquare, laborFoundationSqFt, laborConcreteYd`; added after tax and contingency, shown only once a labor rate is typed) and a budget CSV download (`budgetCsv`). Prices saved in the plan file landed 2026-10-24: the page's Save plan file writes the typed `prices` and loading a plan fills the box again (clicked through in `eval-browser-click.mjs`). Foundation labor landed 2026-10-24 (`laborFoundationSqFt` per slab sq ft, `laborConcreteYd` per cu yd placed, before waste). Not yet: a real supplier's price list.

- **Roof framing** (2026-10-22, `roof.mjs`, CLI `--roof`, plan key `roof: {width, length, pitch, overhang, gableOverhang, rafter, spacing, ridge, ceilingJoist, collarTies}`). Gable roofs: common rafters on the spacing with one at each end, each cut to (half-span - half the ridge + overhang) x sqrt(1 + (pitch/12)^2); a ridge board spliced over rafter pairs; optional ceiling joists (two pieces lapped over a mid-span bearing wall when one board is too short) and collar ties on every other pair; or `trusses: {spacing}` for a purchased truss count. Roof sheathing in 4 ft courses from the eave with end joints on rafter centres and alternate courses staggered, ripped top course noted; shingle bundles (squares x waste x bundles per square), felt rolls, drip edge pieces, ridge cap and starter bundles from coverage figures you can override in `roofing`. Lumber is pooled into the wall order. A rafter longer than the longest listed board is rejected with the way out. Tested in `roof.test.mjs` on the invented 28 x 40 ft 4:12 roof against hand arithmetic (188.9 in rafters, 62 rafters, courses add to the slope length, area and bundle counts); not checked against a real roof's takeoff. On the page (2026-10-22): the "Also frame a gable roof" box (width, length, pitch, rafter, spacing, ridge, overhangs, ceiling joists, collar ties) shows the roof card and pools the lumber into the order; clicked through in a real browser (`eval-browser-click.mjs`: roof on, spacing changed, no page errors) and the plan file round-trips the roof. Hip roofs (2026-10-22, `"shape": "hip"`, optional `"hip": "2x10"`; `length` is the long side; CLI, engine and the page: a "Roof shape" select and hip-size select, clicked through in a real browser with a 16 x 24 ft hip; a 28 x 40 ft hip needs 21 ft hips and is refused with default 16 ft stock): common rafters on the spacing between the hip ends plus one at the middle of each end plane, four hips at 45 degrees (length = side run x sqrt(2 + (pitch/12)^2)), jack rafters at every spacing from each corner on both planes (run = distance from corner + overhang, less the hip half thickness square to the jack), a ridge of length - width, sheathing courses cut to each plane's trapezoid or triangle (counted by their longest edge, so the sheet count is an upper bound), and hip-cap feet in the ridge cap. Tested against hand arithmetic and the closed-form plane areas for a 20 x 40 ft 4:12 hip; trusses are refused for hips. Not done: dormers, birdsmouth depth, and any span-table or uplift check. Cross wings (L and T plans, 2026-10-22, `roof.wing: {width, projection, at, side, valley}`, gable main roof, equal pitch, CLI and engine only): wing commons on the spacing from the wing's gable end while clear of the main eave line, valley jacks past it, two valleys of (wing half-width + overhang) x sqrt(2 + (pitch/12)^2), a wing ridge reaching half a wing-width inside the main wall, main rafters facing the wing cut short at the valley, wing planes added to sheathing (upper bound) and shingle, ridge, drip edge and valley-flashing quantities; tested in `roof.test.mjs` on a 16 ft wing 12 ft out of a 28 x 40 ft 4:12 roof against hand arithmetic and a closed-form area, not against a real roof's takeoff. Wing ceiling joists landed 2026-10-22 (when `ceilingJoist` is set: wing-width joists on the wing's stations short of the main wall, lapped over a mid-span wall if one board is too short; hand-count test). Wing collar ties landed 2026-10-22 (when `collarTies` is set: every other pair of wing commons, same drop rule as the main roof; hand-arithmetic test). A wing at its own pitch (2026-10-24, `roof.wing.pitch`, page field "Wing pitch"): the valley is the intersection of the two planes, so the wing ridge meets the main plane `hw x wing/main pitch` inside the main wall, the valley runs out to the first eave line it reaches (length yEnd x sqrt(1 + s^2 + (wp/12)^2), s = wing pitch / main pitch), jacks are cut back by the valley's half thickness at its real plan angle, and the area integrates the two planes; tested against hand arithmetic and a numeric integral of the plan areas for a 3:12 wing on a 4:12 roof, and an equal pitch changes nothing; not checked against a real roof's takeoff, and where the wing is lower the small step of main plane left beside the wing eave is not flashed. Two wings (2026-10-24, `roof.wing2`, same fields as `wing`, engine and CLI; on the page from 2026-10-24: a "Second cross wing" select that appears once the first wing is on, with its own width, projection, pitch, centre, side and valley fields, round-tripped in the plan file, clicked through in headless Chromium): each wing is laid out as if alone and the results add (counts, sheathing area, eave and valley feet), tested by comparing the pair against each wing alone; two wings on one side need 2 ft between them along the ridge, and a wing on the far side may sit directly opposite (a cross plan). Valley backing (2026-10-23, `roof.valleyBacking: true`, engine and CLI plan key; one board per valley at the valley's length and size, no bevel rip or lap; test checks counts and lengths only) is framed on request. Valley backing on the page landed 2026-10-23 (a "Valley backing" select in the wing fields, round-tripped in the plan file, clicked through in headless Chromium: the card lists it). Not done: a wing off a wing.

- **Layout.** An end stud at each end; a stud centred on every multiple of the
  spacing from the start end (the second stud's edge at 15-1/4" for 16 o.c.).
  Openings replace the layout studs they cover with kings, jacks, a built-up
  header and cripples kept on layout above the header and under a window's
  rough sill. Corner and tee backing studs are placed at the nearest spot clear
  of other members. Door openings cut the bottom plate.
- **Plates.** Plates longer than the longest board are spliced over the centre
  of a full-length stud, choosing joints that minimise the cost of the pieces;
  cap plate joints are kept at least the offset you set (24" by default, the
  figure the IRC's section R602.3.2 uses in recent editions; check yours) from
  top plate joints.
- **Self-check.** Every wall is verified after layout: every member inside the
  wall, no two members in the same space, every rough opening clear, a header
  over every opening, every plate joint over a full stud. The page shows the
  result for each wall.
- **Order.** For each lumber size, a cutting-stock problem over the board
  lengths and prices you list (8 to 16 ft plus the precut stud by default):
  Gilmore-Gomory column generation for a lower bound and a near-cheapest order,
  first-fit-decreasing kept as a fallback, and an exact dynamic program for
  groups small enough to finish. Saw kerf is counted on every cut.
- **Sheathing** (opt in: the page checkbox, `--sheathing`, or a `sheathing`
  block in the plan). Vertical panels from each wall's start end, full wall
  height, every joint on the centre of framing that runs the panel's height (a
  stud, king, corner or tee backing stud, or the cripple/header/sill column
  around an opening), so at 19.2 o.c. a panel is ripped short to the last stud
  that fits. Openings are cut out of the panel that covers them. The sheet is
  the cheapest one at least as long as the wall (4x9 for the precut 8 ft wall's
  97-1/8"); the order is a cutting-stock problem over 48" strips, pooled across
  all walls, so one wall's remainder becomes the next wall's panel, with an LP
  bound. Walls marked `"sheathed": false` (interior) are skipped. Where a joint
  has to fall over an opening with no cripple under it, the note says to fit a
  nailer, and `nailerLumber` (also in the CLI's sheathing section) gives the
  nailers as a cut list and a board order from the plan's stock, to add to the
  framing order. With `--sheathing` (and on the page) the nailers are also pooled into the framing order itself, so they can come out of its offcuts.
- **Outputs.** Order with totals, cut list, board-by-board cutting plan with
  offcuts, layout marks per wall, an elevation drawing per wall, CSV export, and
  a plan file you can save and reopen.

## Method and citation

- Gilmore, P. C. & Gomory, R. E. (1961). A linear programming approach to the
  cutting-stock problem. *Operations Research* 9(6), 849-859.
  doi:[10.1287/opre.9.6.849](https://doi.org/10.1287/opre.9.6.849). Column
  generation for the LP relaxation, with a bounded knapsack (dynamic programming
  in 1/16") as the pricing problem, over several board lengths each with its own
  price. The LP is solved through its dual (a dense simplex with Bland's rule),
  whose origin is always feasible, so no phase one is needed. Integer orders come
  from sequential rounding: take the whole part of the LP solution, re-solve the
  pieces left, repeat. The engine exports this as `PAPERS`.

## Use it

- **Browser:** open the live page. It starts on an invented example house; edit
  any field or click "Start empty". Lengths take `40'`, `13' 3"`, `92-5/8` or
  `150 1/2`; a bare number is inches.
- **Command line** (Node 18+, no install):
  `node cli.mjs --example > plan.json`, edit it, then `node cli.mjs plan.json`
  (`--json` for the full result, `--csv` for the order and cut list, `--drawings > walls.html` for the shop drawings below).
- **AI agents / MCP:** from a clone of the repository,
  `node platform/agents/tools.mjs call wall-framing-takeoff takeoff --args '[<plan JSON>]'`,
  or `run wall-framing-takeoff -- plan.json`
  ([`platform/agents/`](../../platform/agents/README.md)).

A plan is JSON (optional `blocking: {rows: 1, fire: true}` adds blocking rows; `fire` adds rows so no stud run passes 10 ft): `studSpacing`, `studLength`, `kerf`, `topPlateLap`,
`cornerExtraStuds`, `teeExtraStuds`, `defaultHeaderHeight`, `stock` (`size`,
`length`, `price`, optional `label`) and `walls` (`id`, `length`, `stud`,
`treatedPlate`, `corner`, `tees`, `openings` with `kind`, `offset`, `width`,
`height`, `header`, optional `headerHeight`, `headerPlies`, `jacks`, `kings`,
`sillPlies`, `label`). `node cli.mjs --example` prints a complete one.

## Verification

`node --test` (42 tests across engine, CLI, page and usage). What they check:

- **Hand-counted walls.** A plain 10 ft wall at 16 o.c. has studs at exactly
  0, 15-1/4, 31-1/4, ... 111-1/4 and 118-1/2. A 36 x 48 window gets kings at
  37 and 77-1/2, 81" jacks, two 39" header plies, a 36" sill, two 2-3/8" top
  cripples and four 31-1/2" bottom cripples at the hand-worked positions. A door
  cuts the bottom plate at its rough opening.
- **400 seeded random walls** (lengths 4 to 47 ft, 2x4 and 2x6, 16/19.2/24
  o.c., three wall heights, up to five openings, corners and tees): every valid
  one passes the self-check above.
- **Plate splices** on walls up to 50 ft: every piece fits a 16 ft board, every
  joint is over a full stud, every cap joint at least 24" from every top joint.
- **Optimiser against the exact solver** on 120 seeded cases: every piece is
  cut exactly once, no board is overfilled (kerf counted), the cost is never
  below the LP bound, and the shipped order equals the exact cheapest order on
  every case the exact solver finishes.
- **Sheathing:** a 10 ft wall gets joints at 48 and 96; at 19.2 o.c. the first
  panel is ripped to the 38.4 stud; window cut-outs add up to the opening
  width; on 400 seeded random walls (60 to 456 in, three spacings, up to
  three openings) the panels tile the wall, every joint has framing under it,
  and the cost is never below the bound.
- **The LP solver** reproduces a textbook LP and its dual exactly.

`node bench.mjs` measures the optimiser (seeded, reproducible):

```
Small instances (exact solver finishes): share where each method equals the exact cheapest order
prices        n   LP rounding   first fit decr.   shipped (exact used)    mean excess LP / FFD
flat        150    84.7%         64.7%            100.0%               0.92% / 1.89%
priced      150    84.7%         29.3%            100.0%               0.53% / 9.50%

Sample house, n copies: cost against the LP lower bound (price 1 per linear foot)
copies  pieces  boards     cost    bound    gap    FFD cost   each piece alone   ms
     1     345     253  2384.16  2384.12  0.002%    2450.00            2915.04   117
     2     690     503  4769.16  4768.23  0.020%    4901.72            5830.08   148
     4    1380    1004  9532.60  9531.45  0.012%    9786.00           11660.16   180
```

"Flat" prices are proportional to length; "priced" ones rise per foot with
length, as longer boards often do. Rounding the LP finds the exact cheapest
order on 85% of small cases; first-fit-decreasing on 65% with flat prices and
29% with priced ones, where its habit of starting every board on the longest
length costs 9.5% on average. On whole houses the order is within 0.02% of the
LP bound, so there is almost nothing left for a better integer method to find
there; the gap that matters is against planning by hand (the "each piece alone"
column is the extreme case: 22% more board).

## Advanced framing (2026-10-22)

Plan `"advanced": { "twoStudCorners": true, "ladderTees": true, "singleTopPlate": true }` (or the
"Advanced framing" menu on the page):

- `twoStudCorners` puts one backing stud in a `corner: true` wall instead of
  `cornerExtraStuds` (the end stud plus one), for drywall clips.
- `ladderTees` replaces the tee backing studs with flat 2x blocks every 24 in
  between the full-height studs either side of the tee, for the partition to
  nail to. Where those studs are more than one stud spacing apart, or an
  opening is between them, that tee keeps standard backing and a note says so.
  The blocks come out of offcuts in the order.
- `singleTopPlate` (2026-10-22) leaves out the cap plate, so the wall is 1-1/2 in
  shorter. With nothing lapping the top plate's joints, each joint, corner and
  tee takes a steel plate tie; the count is `plateTies` on the wall and a note
  lists where (ties are not in the takeoff). It needs roof or floor framing
  within 1 in of the stud centres (the IRC R602.3.2 exception; check your
  edition), which this tool cannot see. On the example house it takes 345 pieces
  / 253 boards / $2,384.16 down to 329 / 238 / $2,173.88 (-8.8%, 20 ties).

Measured on the built-in example house (`samplePlan`, 8 walls, priced stock;
`takeoff().summary`):

| option | pieces | boards | full-height members | order cost |
|---|---|---|---|---|
| standard | 345 | 253 | 179 | $2,384.16 |
| two-stud corners | 341 | 249 | 175 | $2,353.28 |
| ladder tees | 352 | 250 | 165 | $2,307.52 |
| both | 348 | 246 | 161 | $2,276.64 |

Both: $107.52 (4.5%) less lumber on that house (one tee fell back to standard
backing). This counts lumber only. Whether a given wall may use either detail
is a code and engineer's call (clip stiffness, nailing for the partition), not
something this tool checks; the options are off by default.

## Corner plate laps

Set `"plateLaps": true` in the plan (or pick it on the page). A wall with
`corner: true` meets the end of the wall listed before it (the first wall meets
the last). At each corner the earlier wall's top plate runs through by the later
wall's depth while the later wall's top plate stops short by the earlier wall's
depth; the cap plate laps the other way, tying the corner. Piece lengths and the
splice points change, and so can the board order; plate totals do not (the test
checks it). Splices still sit over full studs.

**Tee laps (2026-10-21).** A partition can say where it butts a through wall:
`"tee": {"wall": "Front", "at": "14'", "end": "start"}` (`end` is `start` or
`end`; `at` is the partition's centre along the through wall). With `plateLaps` on,
the partition's cap plate runs over the through wall by its depth and the through
wall's cap is cut for the partition's depth, each run spliced on its own. Unlike
corners, the cap total changes (by the through wall's depth minus the partition's). The page has a "Butts into (tee lap)" field per wall: `Front @ 14'` (add `end` for the wall's far end); checked in headless Chromium (valid entry runs clean, a malformed one is reported, no page errors).

## Limits

- **Headers from your own span table** (2026-10-22, `headers.mjs`, CLI `--headers`). Put `"headerTable": [{"upTo": 36, "header": "2x6", "plies": 2}, ...]` in the plan, rows copied from the span table your code or engineer gives for your load, building width and stud size. An opening with `"header": "auto"` (or none) takes the first row whose `upTo` covers its rough width and the row's plies; a header you picked yourself is kept and listed as UNDER when it is shallower or has fewer plies than the table asks for. A span past the last row, a row with an unknown size and a table that gets lighter for longer spans are errors. No code values ship with the tool, so it checks your table, not the code. Node-tested on a made-up table (`headers.test.mjs`); not on the page yet.
- **Header table on the page** (2026-10-24, `index.html`, `eval-browser-click.mjs`). Section 3 has a "Size headers from your own span table" box: one row per line, `longest span, size, plies` (`3 ft, 2x6`). An opening whose header is set to `auto` takes the first row that covers it, a hand-picked header lighter than the table asks for is listed under the box, an `auto` with no table is refused, and the saved plan file keeps the table and the `auto` choices (the same `headerTable` key the CLI reads). Same `resolveHeaders` as the CLI. Checked with a click through in headless Chromium (3 rows, two openings resolved, empty table refused); the table is yours, no code values are shipped.
- **No structural checks.** Header size, plies, jack count, stud size and
  spacing are inputs. Nothing checks them against a span table, a load or a
  building code.
- **Two courses (2026-10-21):** when no listed sheet is as long as the wall (say 12 ft 4-1/2 in of wall and nothing past a 4x10), `chooseCourses` picks a lower sheet and an upper course of at least `minCourse` (12 in) by lowest price per strip, counting the bands that cut crosswise from one sheet (four 24-1/2 in bands from a 4x9). The horizontal joint gets a piece of the wall's stud size on edge in every bay between studs (`jointBlocks`; bays an opening cuts out at that height are skipped, an existing blocking row counts), the pieces join the nailer cut list and board order, and the wall check fails if the joint has nothing to nail to along its length. Vertical joints of both courses sit on the same studs. Tested on 300 seeded walls of 125 to 154 in studs. Not checked against an engineered shear-wall schedule: blocking and nail spacing at the joint are yours to confirm.
- **Horizontal sheathing (2026-10-21):** `sheathing.orientation: "horizontal"` (CLI `--horizontal`, page tick box "sheets long side along the wall") lays sheets long side along the wall in courses one sheet width high from the floor. End joints land on stud centres (the same bearing test as vertical panels), alternate courses start half a sheet in so joints are staggered, a last course under `minCourse` (12 in) is avoided by ripping the course below it too, and every course boundary gets blocking on edge between studs (`jointBlocking`, the same pieces as the two-course joint). Each listed sheet length is tried for the whole house and the cheapest order wins; full courses pool into one cutting-stock order and a ripped course is cut crosswise into bands. Measured on the example house at 1 per square foot: horizontal 1344 (4x12) against 1296 vertical (4x9), because the ripped courses and the blocking-heavy joints cost more than full-height panels on 9 ft walls; horizontal is for walls the vertical layout cannot cover or where your inspector or shear schedule wants it. Tested on 200 seeded walls (every edge on framing, courses add to the wall height, no sliver course, joints staggered). Not modelled: mixing two sheet lengths in one house, a horizontal layout that lets a joint fall over an opening (it hand-sheathes that wall instead), and nailing schedules.
- **Rim lap (2026-10-21):** `sheathing.rimLap: 9.25` (CLI `--rim-lap=9.25`, page field "rim lap (in)") runs vertical sheathing that many inches below the bottom plate to cover the floor's rim board, so the sheet is picked for wall height plus the lap (a taller sheet or two courses where needed) and a note says to nail it to the rim. Panels start at a negative height; the self-check and order are unchanged. It does not check the floor's rim depth or that anything is there to nail to; horizontal sheets ignore it (a note says so).
- **Corner overhang (2026-10-21):** `sheathing.overhang: true` (CLI `--overhang`, page tick box "run sheathing past corners") runs each wall's vertical sheathing past its end by the next wall's stud depth where that wall has `corner: true` (same earlier-wall-runs-through reading as `plateLaps`), so the sheets cover the corner's end stud. The last panel is longer by that amount, and the wall's self-check covers the extra width. Not applied to horizontal sheets (a note says so), and the later wall's sheathing is not trimmed back for the sheet's thickness.
- **Not modelled yet:** let-in or
  structural bracing, header spacers (listed in the notes), hardware and
  fasteners, walls that change height or have an off-centre peak, multiple storeys,
  window and door rough openings given by unit size (enter rough openings), and
  plates lapping at corners that do not close a loop (`plateLaps` reads the walls as a
  closed loop in the order listed).
- **Openings within 1-1/2" plus their kings and jacks of a wall end** are
  rejected rather than framed: frame those ends by hand.
- **Prices default to 1 per foot of board**, so the default order minimises
  length bought. No lumber price is stated or implied.
- The example house is invented.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering, construction, building-code,
legal or financial advice, and it does not replace a qualified professional,
your plans or your building department. Header sizes, jack counts and stud
spacing are your inputs and are not checked against any span table or code.
**You are responsible for reviewing and verifying its output before relying on
it**, including every length before you cut. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

**Privacy.** Everything runs in your browser. Your plan is never uploaded, and
there are no accounts, tracking cookies, or analytics vendor. The page counts
anonymous events (`takeoff_run`, `example_loaded`, `csv_downloaded`, `drawings_downloaded`, `panel_order_downloaded`,
`plan_saved`, `plan_opened`) in your browser's local storage only, and keeps
your last plan there so it is back when you return; the footer has a switch to
turn counting off.

Not affiliated with any lumberyard, builder, code body or software company.
MIT licence ([LICENSE](LICENSE)). [Support](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.

## Gable walls

Set `"gable": {"pitch": 6}` on a wall (rise per 12 in of run) to frame a symmetric gable end: a level bottom plate, studs whose lengths follow the roof (the long point of the angled cut; the eave studs are `studLength`), and top and cap plates measured along the slope, spliced over studs with the usual cap offset. Add `"peak": 80` (inches from the wall start) for an off-centre peak: `pitch` is then the start side's rise per 12 in, and the far side gets the pitch that reaches the same peak height, so both eaves stay level (result `gable.farPitch`). Openings are framed as in a level wall (2026-10-21): header, jacks and sill at their heights from the bottom plate, kings and top cripples cut to the long point of the slope, the bottom plate cut across a door; the header must fit under the eave-line top plate, so a window in the triangle itself is not done. Blocking is not done for gable walls. Sheathing is (2026-10-22, `sheatheGables` in `sheathing.mjs`, vertical sheets): panels end on full-height studs within a sheet width, each is cut from a sheet at least as long as its long point (two courses when the peak is taller than every sheet), and the gable has its own sheet order. Offcut triangles are reused (2026-10-24, `nestedHeight`/`nestPairs` in `sheathing.mjs`): the sloped top course of one panel can be cut from the same sheet piece as another's, one turned end for end, as tall as the two heights added at the same distance from the edge; pairs are chosen greedily by area saved and kept only if the full cutting-stock order comes out cheaper than buying every course as its bounding box (`summary.unnestedCost`, `panel.nestedWith`). On a 20 ft, 6:12 gable with the default sheets and a price of 1 per sq ft this takes the order from 292 to 256; a steeper 24 ft, 8:12 gable has no pair that fits one sheet and stays at the bounding-box order. Tested against hand heights (a 48 in course 20..44 in turned on itself is 64 in) and as never dearer; a nested cut has not been tried on real sheets, and a course that straddles the peak is not nested. On the page since 2026-10-24 (walls table: "Gable pitch" and "Gable peak at"; saved in plan files, bad pitch refused; page test and a browser click check, no engine change). Not yet the horizontal layout's gable courses, or nailers over openings; the roof-line area is checked against a closed form in `engine.test.mjs`.  Tested in `engine.test.mjs` on a 20 ft, 6:12 wall: layout self-check clean, plate length equals run x sqrt(1 + slope^2).

## Shop drawings

`node cli.mjs plan.json --drawings > walls.html`, or "Download wall drawings" on the page, gives one printable sheet per wall (2026-10-21, `drawings.mjs`): a dimensioned elevation to scale, every member marked (S1, K1, H1, C2 ... members of the same kind, size, length and label share a mark), rough openings dashed and labelled, plate joints in red, a chain of stud-to-stud dimensions and the overall length, a parts table (mark, quantity, size, cut length), the layout check result and the no-warranty text. Gable walls draw their sloped plates. It runs in the browser and the CLI from the same module, with no upload. Tested in `drawings.test.mjs` (every member marked, quantities add up to the member count, labels escaped, gable walls) and clicked through in headless Chromium (the example house: 8 sheets, no page errors). Not yet: a PDF (print to PDF from the browser works), per-panel sheets that split a long wall into transportable panels, and nailer or sheathing marks on the drawing.

## Shop panels

`node cli.mjs plan.json --panel-max=12ft` (or the "Longest shop panel" box on the page, then the drawings button) splits each wall on the drawings into panels no longer than the limit. `panels.mjs` picks the fewest panels, then the most even widths, and cuts only where no stud, king, jack, cripple, header, sill or block crosses the line, so each panel is built from whole members; plates are cut to panel length and the end studs of neighbouring panels are nailed together on site. A wide opening can leave no clear cut line inside the limit; that panel is flagged "over limit", not hidden. Tested on the sample house (`panels.test.mjs`, `drawings.test.mjs`, `cli.test.mjs`) and clicked through in headless Chromium (`eval-browser-click.mjs`). Add `--sheathing-psf=1.5` (lb per sq ft; 1.5 is typical of 7/16 in OSB or 1/2 in plywood, check the data sheet) and each panel also shows its sheathing weight (panel width times wall height, less the rough sizes of the openings inside it; none on gable walls) and a total (`panelParts` `sheathLb`, `totalLb`; node-tested against a hand count; engine, CLI and the "Sheathing weight on shop panels" page box, which feeds the drawings download; clicked through in headless Chromium 2026-10-23: a weight of 0 gives shorter drawings than 1.5). `--panel-order` (with `--panel-max`) prints the lumber order for the shop panels: every panel's pieces, plates trimmed to panel length, pooled and cut from stock (`panelOrder` in `panels.mjs`), beside the whole-wall order. On the sample house at 12 ft: 250 boards at 2385.88 against 253 boards at 2384.16 for whole walls (each plate break costs a kerf and shifts the packing; nailers are pooled in with `--sheathing`). `--pull-lists` adds a pull list per panel: which boards (size, length, number) it is built from and the cuts on each, with a note when a board also feeds another panel (`assignBoards`, greedy: keep a board's cuts together in one panel where the demand allows; every panel piece placed exactly once, node-tested). CLI and, since the "Download shop-panel lumber order" button (needs a panel length), the page: its download holds the order and the pull lists, and without a panel length the status line asks for one (headless Chromium click check, 2026-10-23, `eval-browser-click.mjs`; the example plan only). A layout aid, not engineering: lifting, bracing and shipping are the builder's call.

- 2026-10-23: the page takes a cross wing (width, projection, centre, side, valley size) on gable roofs; fields hide on hip roofs. Page test plus a headless-Chromium click check (`eval-browser-click.mjs`); the engine numbers are unchanged and still hand-arithmetic only.

## Opening cut-out reuse (measured 2026-10-23)

`node cutout-reuse-bench.mjs` asks whether a window or door cut-out could supply another panel. On the sample house, no panel fits a free-standing hole: vertical 0 of 38 panels (4 holes), horizontal 0 of 42 (no interior holes; windows break a course edge, so they are notches). A 2D reuse would shed no sheets here, so it is not built. Recheck on a plan with large glazing.
