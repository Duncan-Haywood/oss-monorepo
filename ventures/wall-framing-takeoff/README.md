# Wall Framing Takeoff: stud layout, cut list and lumber order for a house

A free, in-browser **wall framing calculator and takeoff** for builders,
framers and owner-builders: type the walls, doors and windows of a house and
get the **stud layout** (16, 19.2 or 24 on center), every **king, jack,
header, rough sill and cripple**, plate **splices that land on studs** with
the cap plate's joints kept away from the top plate's, a **cut list**, and the
**cheapest mix of board lengths to buy**, with a lower bound that shows how
close the order is to the cheapest possible. Nothing is uploaded. Also a
command-line tool and an engine AI agents can call.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/wall-framing-takeoff/

After using this, you can hand a lumberyard an order and a framing crew a cut
list and layout marks for every wall, instead of an allowance of "one stud per
foot plus 10%".

It is the first tool of a longer project to automate parts of new-home
construction in the US and bring its cost down: [ROADMAP.md](ROADMAP.md).

## What it does

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
  nailer.
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
  (`--json` for the full result, `--csv` for the order and cut list).
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

## Limits

- **No structural checks.** Header size, plies, jack count, stud size and
  spacing are inputs. Nothing checks them against a span table, a load or a
  building code.
- **Not modelled yet:** sheathing over two courses (a wall taller than the longest sheet), horizontal sheathing, corner overhang, blocking and fire blocking, let-in or
  structural bracing, header spacers (listed in the notes), hardware and
  fasteners, gable and rake walls, walls that change height, multiple storeys,
  window and door rough openings given by unit size (enter rough openings), and
  plates lapping into the intersecting wall at corners (the totals are the same;
  the piece lengths shift by the wall thickness).
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
anonymous events (`takeoff_run`, `example_loaded`, `csv_downloaded`,
`plan_saved`, `plan_opened`) in your browser's local storage only, and keeps
your last plan there so it is back when you return; the footer has a switch to
turn counting off.

Not affiliated with any lumberyard, builder, code body or software company.
MIT licence ([LICENSE](LICENSE)). [Support](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.
