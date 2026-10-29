# Shed Designer: gable shed plans, 3D view and lumber cut list

Shed Designer is a free browser tool for people building their own backyard shed. You drag out a gable shed, and it frames every board at its real size. You get construction drawings, a 3D model, a cut sheet that says which board each piece comes out of, and a shopping list with a cost.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/shed-designer/

**After using this, you can now** take a printed plan set and a board-by-board cut sheet to the lumberyard and the saw, for the exact size of shed you want. **That used to take** a fixed plan set in somebody else's size plus an evening with a tape, a calculator and a spreadsheet.

For assistants: [llms.txt](llms.txt).

## What it does

- **Height-led roof.** Set a most-height-at-the-peak limit and tick the two auto boxes. The walls drop to the lowest the tallest door or window allows, and the roof takes the steepest whole pitch that stays under the limit. When no pitch can, the tool says by how much the limit is missed and what would fix it (`buildAuto` in `model.mjs`).
- **Ridge beam or ridge board.** A ridge beam is two plies of 2x8 to 2x12 bearing on a two-ply post in each gable, over two post studs in the wall. Rafters stop at the beam face and get hangers, and there are no ties. A ridge board gets rafter ties at the plate on every pair. Gable vents centre under a ridge board and flank the post under a beam.
- **Colour.** Siding paint colours, and purple polka dots, show in the 3D view. Paint is added to the shopping list at two coats and 350 sq ft per gallon.
- **Design by dragging.** On the plan view you drag the footprint corner or edges (6" steps) and slide doors and windows along a wall or onto another wall. On the end view you drag the peak (roof pitch), the wall top (wall height) and the eave tip (overhang). Every number is also a labelled field. Undo and redo cover both.
- **True dimensional lumber.** A 2x4 is framed at 1-1/2" x 3-1/2", a 2x6 at 5-1/2", a 2x8 at 7-1/4", a 2x10 at 9-1/4" and a 2x12 at 11-1/4"; 4x4 and 4x6 skids at 3-1/2". Stud length is the wall height less three plates. A rafter's cut length includes its plumb cut. The ridge is the first 2x size deeper than the rafter that also covers the plumb cut (`lumber.mjs`, `model.mjs`).
- **Foundation, floor, four walls and a gable roof.**
  - *Foundation:* pressure-treated skids, spaced no more than the gap you allow, on a gravel pad (volume in cubic yards and tons) or on solid concrete blocks.
  - *Floor:* rim joists and floor joists on layout, and 3/4" plywood in staggered rows.
  - *Walls:* the eave walls run full length and the gable ends frame between them. Studs are laid out from the building corner, so 4 ft sheet edges land on a stud. Corner studs, kings, jacks, doubled headers (with a spacer note), rough sills and cripples are all framed. The bottom plate is cut out at doors. Plates longer than your longest board splice over studs, and the cap plate's joints are kept 4 ft from the top plate's.
  - *Roof:* rafters with a birdsmouth (full plate-width seat) and plumb cuts, a ridge board, rafter ties at the plate, gable studs cut to the roof line, and a post under the ridge.
  - *Gable vents:* a trimmer each side, a flat header as high as the roof allows, a sill block and short posts.
  - *Coverings:* T1-11 siding (4x8, 4x9 or 4x10, picked to reach the eave or the gable line), OSB roof sheathing in staggered courses, shingles, underlayment and drip edge.
- **Producer cut sheet.** For each material the pieces are packed into the board lengths you tick (8 to 20 ft) at the prices you type, with kerf between cuts. The method is best-fit-decreasing, tried once with each stock length as the default board; each board is then shrunk to the cheapest length that still holds its cuts, and the cheapest plan is kept. The result shows a lower bound: every inch bought at the cheapest price per inch of any board long enough for it. Each board is drawn as a bar of its cuts, by part mark, with the offcut hatched. A CSV is available (`optimize.mjs`, `estimate.mjs`).
- **Plans.** Eight sheets: foundation plan, floor framing plan, the four wall framing elevations (seen from outside, every opening dimensioned, part marks on members), the roof framing plan and a building section with pitch, heights and overhang. Print them, or download each sheet (or all of them) as SVG, or as DXF R12 in inches at full size with layers FRAMING, OUTLINE, HIDDEN, OPENINGS, DIMS and TEXT (`drawings.mjs`).
- **3D view.** A small WebGL renderer, no library. Every board is an extruded profile, so rafters show their birdsmouth and gable studs their angled tops. You can orbit, zoom, switch to front, gable end or top views, and toggle layers (foundation, floor, walls, roof, sheathing, siding, roofing). "Framing only" strips it to the frame (`render3d.mjs`).
- **Several designs, compared.** You can start new designs from presets (8x12, 8x10, 10x12, 12x16, 8x8) or copy the current one. Each design gets a card with a 3D thumbnail, its footprint, peak, board count, total and cost per square foot, and the lowest-cost design is marked. You can save a design to a file, open one from a file, or copy a link that carries the design inside the URL.

The starting design is the owner's spec: an 8x12 with a single 38" x 78" (6'6") door on one 12 ft side and two 24" x 36" windows on the opposite side. The 2x4 walls are 16" on centre. The roof is a ridge beam (two-ply 2x10 on two-ply posts, so no rafter ties and an open inside), with 12" x 8" gable vents flanking each post. The outside is hot pink with purple polka dots and glitter under a purple roof with white trim, the inside is a pink teen bedroom, and the peak is limited to 8 ft.

All three automatic choices are ticked:

- **Walls:** 86-1/2". That is 78 for the door, 5-1/2 for a 2x6 header and three 1-1/2" plates.
- **Pitch:** 5/12. No pitch keeps the peak under 8 ft with that door, so the tool takes the lowest pitch at which the vents still fit, and the warning says the peak is about 10'1". Even 3/12 would be about 9'5-1/2".
- **Overhang:** 6". Any longer and the 59-3/16" rafters cost more lumber.

At the starting prices that design is 150 pieces from 88 boards: $636.90 of lumber against a lower bound of $606.82, and $2,538.63 in all, interior included. Every structural check passes, and the ridge beam is the most loaded member at 80%. The "8x12 classic" preset (8 ft walls, 6/12, ridge board and ties, 38" x 82" door, unpainted) is 144 pieces from 93 boards and $2,166.66.

## Structure, integrity and prices

- **Structural checks** (`checks.mjs`, Structure tab). The members checked are:
  - the floor joists between skids;
  - the rafters;
  - the ridge beam and its posts, using column stability on the posts;
  - every door and window header;
  - the eave-wall studs under roof load plus wind on the wall face.

  These are allowable-stress (NDS) checks on SPF No. 2 under a roof snow load and a wall wind pressure you set (defaults 30 and 20 psf), with 15 psf roof dead load and 40 + 10 psf on the floor. The engine is `structure.mjs`, copied unchanged from `open-house-plans`, where it is pinned against the research track's Python; its fixture test comes with it. Each member shows its use of capacity. This is a screening check: connections, uplift, racking and the foundation are not checked.
- **Integrity tests** (`integrity.mjs`, `integrity.test.mjs`).
  - Starting from the gravel pad, every board, sheet and fixture must be reachable through pieces that touch it, so nothing floats.
  - No two square-cut members may overlap by more than 1/16".
  - Every preset and variation is checked.

  The test found a real bug on 2026-10-29: every wall member was placed starting at the floor, so the top plates, headers and sills sat at floor level in 3D. It also found that the two plies of each header overlapped, and that the new eave blocks collided with rafter ties. All three are fixed, and the tests stop them coming back.
- **Prices with sources** (`prices.mjs`). Starting prices are Home Depot listings seen on 2026-10-29, most read from the search result's copy of the product page, so they can be stale and they vary by store. Each line of the shopping list links its listing. Lengths without a listing are scaled per foot from the nearest listed length and marked "(scaled)". Items with no listing at all (rake board, paneling, glitter, gravel, blocks, accent and interior paint) say "estimate". Every price is editable.
- **How to build** (`instructions.mjs`, its own tab). Nineteen sections in build order, written from the design with its own numbers:
  - permits and tools; the gravel pad with its diagonal; the skid centres;
  - floor joist layout marks and the frame diagonal; the subfloor cuts;
  - each wall's centre marks for every stud, king, jack and cripple, from the left end as seen from outside, with the opening framing and the wall diagonal;
  - the ridge beam height; the rafter's plumb and birdsmouth layout (speed-square reading, run, heel and seat); the gable studs and vents;
  - roofing order, siding, trim, paint (with a polka-dot stencil method) and the interior.

  Every piece is called by its cut-sheet mark. You can print it or download it as Markdown. Fastener spacings are typical values to check against local code and product instructions.
- **Options made for you** (`candidates.mjs`). Seven close variations of the design you are editing: rafter spacing, ridge beam or board, a steeper or lower roof, a foot of overhang, a foot wider. Each is framed, priced and structurally checked, then ranked with passing designs first and cheapest first. "Use this one" adds it to your designs.
- **Roof edge.** A 2x6 sub-fascia across the rafter tails (in the cut list), a 1x6 fascia, a vented soffit under the tails and a 1x4 rake board on each gable edge. Blocking between the rafters closes each wall top.
- **Looks.** Siding, roof and trim colours, polka dots and a glitter finish. The siding paint (two coats, 350 sq ft a gallon) and glitter packets are added to the list. A "teen bedroom" interior adds pink paneling, generic poster art of an invented band, string lights, a rug and a beanbag. The big poster can show a picture you upload, which stays in your browser. "Look inside" opens the front wall.

## What it does not do

- The ridge beam size is your choice, not a span-table result.
- The structure check is a screening check, not a code review or an engineer's design: it does not check connections, uplift, racking, the foundation or point loads. Header sizes follow a rule of thumb by opening width (2x6 up to 48", 2x8 up to 72", 2x10 up to 96") and the Structure tab then checks each one. Warnings flag a birdsmouth deeper than a third of the rafter, an opening that does not fit, and a vent too big for the gable.
- Gable sheds on skids only. It does not do lofts, hip or single-slope roofs, porches, ramps, slabs, fascia or trim, drywall, door slabs or nails.
- Sheet counts pack pieces along an 8 ft sheet. Narrow strips are not combined, so the counts lean high.
- It has been checked with hand-counted unit tests and by driving the page in headless Chromium. It has not been checked by building a shed from it.

## Run it

Serve this folder as static files, for example `python3 -m http.server` here, then open `http://localhost:8000/`. The page loads ES modules, which browsers will not load from `file://`. Tests: `node --test` (Node 22).

## Files

| File | What it holds |
| --- | --- |
| `lumber.mjs` | actual sizes, standard lengths, length formatting, example prices |
| `model.mjs` | the framing engine: design in, every member with geometry out |
| `optimize.mjs` | cutting-stock heuristic with a lower bound |
| `estimate.mjs` | parts list with marks, cut sheet, shopping list, CSVs |
| `drawings.mjs` | plan sheets as primitives, rendered to SVG and DXF |
| `render3d.mjs` | WebGL viewer and ear-clipping triangulation |
| `editor.mjs` | drag editing of the plan and end view |
| `checks.mjs`, `structure.mjs` | structural checks (NDS, SPF No. 2) |
| `integrity.mjs` | nothing floats, nothing overlaps |
| `prices.mjs` | starting prices and their sources |
| `candidates.mjs` | the options made for you |
| `instructions.mjs` | step-by-step build instructions from the design |
| `app.mjs`, `index.html` | the page |
| `shed-plans-with-cut-list.html` | the 8x12 worked example, for people searching the question |

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, construction, building-code or legal advice, and it does not replace a qualified professional or your building department. **You are responsible for reviewing and verifying its output before relying on it**, and for permits and inspections. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

## Privacy

Everything runs in your browser. Your designs are never uploaded, and there are no accounts, tracking cookies or analytics vendor. Designs and prices are kept in this browser's local storage so they are there next time; a footer checkbox turns that off and deletes them. Anonymous counts of which features get used (`usage.mjs`: builds, drags, designs, compares, plans printed, DXF/SVG/CSV downloads, links copied) are also kept on this device only and never sent anywhere. A second checkbox stops them and clears them, and a browser's Do Not Track or Global Privacy Control signal is honoured. A shared link carries the design inside the URL's `#` fragment, which browsers do not send to the server.

## License and support

MIT (see `LICENSE`). If it saved you a trip to the yard, [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) or [Buy Me a Coffee](https://buymeacoffee.com/duncanhaywood) are optional and change nothing about the tool.
