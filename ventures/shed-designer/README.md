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

The starting design is the owner's spec: an 8x12 with a single 38" x 78" (6'6") door on one 12 ft side and two 24" x 36" windows on the opposite side. The 2x4 walls are 16" on centre. The roof is a ridge beam (two-ply 2x10 on two-ply posts, so no rafter ties and an open inside), with 12" x 8" gable vents flanking each post. The siding is pink with purple polka dots, and the peak is limited to 8 ft.

With "walls as low as the tallest opening allows" and "roof pitch from the height limit" ticked, the walls come out at 86-1/2". That is 78 for the door, 5-1/2 for a 2x6 header and three 1-1/2" plates. No pitch keeps the peak under 8 ft with that door, so the tool picks 5/12, the lowest at which the vents still fit, and the warning says the peak is about 10'1". Even 3/12 would be about 9'5-1/2". At the example prices that design is 136 pieces from 51 boards: $552.30 of lumber against a lower bound of $538.28, and $2,001.60 in all. The "8x12 classic" preset (8 ft walls, 6/12, ridge board and ties, 38" x 82" door) is 130 pieces from 52 boards and $1,950.90.

## What it does not do

- The ridge beam size is your choice, not a span-table result.
- No structural, span-table, snow, wind or code check. Header sizes follow a rule of thumb by opening width (2x6 up to 48", 2x8 up to 72", 2x10 up to 96") and are not a span table. Warnings flag a birdsmouth deeper than a third of the rafter, an opening that does not fit, and a vent too big for the gable.
- Gable sheds on skids only. It does not do lofts, hip or single-slope roofs, porches, ramps, slabs, fascia or trim, drywall, door slabs or nails.
- Sheet counts pack pieces along an 8 ft sheet. Narrow strips are not combined, so the counts lean high.
- The prices are example placeholders, not collected from any store. Type your own.
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
| `app.mjs`, `index.html` | the page |
| `shed-plans-with-cut-list.html` | the 8x12 worked example, for people searching the question |

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, construction, building-code or legal advice, and it does not replace a qualified professional or your building department. **You are responsible for reviewing and verifying its output before relying on it**, and for permits and inspections. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

## Privacy

Everything runs in your browser. Your designs are never uploaded, and there are no accounts, tracking cookies or analytics vendor. Designs and prices are kept in this browser's local storage so they are there next time; a footer checkbox turns that off and deletes them. Anonymous counts of which features get used (`usage.mjs`: builds, drags, designs, compares, plans printed, DXF/SVG/CSV downloads, links copied) are also kept on this device only and never sent anywhere. A second checkbox stops them and clears them, and a browser's Do Not Track or Global Privacy Control signal is honoured. A shared link carries the design inside the URL's `#` fragment, which browsers do not send to the server.

## License and support

MIT (see `LICENSE`). If it saved you a trip to the yard, [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) or [Buy Me a Coffee](https://buymeacoffee.com/duncanhaywood) are optional and change nothing about the tool.
