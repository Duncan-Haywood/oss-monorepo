# DXF Nesting

A free browser tool for laser, plasma, waterjet and CNC router shops: **load the DXF files for a job, set how many of each part, the sheet size, the gap between parts and the edge margin, and get nested sheets back as DXF**, with utilisation, cut length and pierce counts per sheet. Small parts go inside the holes of big ones. Nothing is uploaded.

**Live tool:** https://marisstella.app/dxf-nesting/

After using this, you can **lay out a small batch of irregular parts on sheets and hand the result to your CAM** without a nesting licence or an afternoon of dragging parts around in CAD, and you know how many sheets a job needs before quoting it.

## Why someone would use it

| Today's option | What it does | What this does differently |
|---|---|---|
| SigmaNEST, ProNest, Lantek, the machine maker's nesting module | Production nesting with search, lead-ins, common-line cutting, remnant tracking | Free, no install, nothing uploaded; a grid nester with a short search, so expect clearly less material efficiency on interlocking shapes (measured below: layouts about 20% longer than the best published on 13 classic benchmarks) |
| Deepnest, SVGnest (free, GPL) | True-shape nesting with a genetic search; desktop app or SVG in the browser | DXF in and DXF out directly, units kept, holes used, a stated and checked gap guarantee, a command line |
| Arranging parts by hand in CAD | Whatever the operator has time for | Seconds per job, the same answer every time |

## Use

1. Open the page, drop in one or more ASCII DXF files (or load the worked example), set each part's quantity.
2. Enter the sheet length and width in the drawing's units, the gap between parts, the edge margin and the allowed turns (0/90/180/270, 0/180 for grain, none, every 45 or every 15 degrees).
3. Press **Nest**. Each sheet is drawn; download one DXF per sheet or all sheets in one file, and the CSV report.

Command line (Node 18+): `node cli.mjs bracket.dxf:20 flange.dxf:8 --sheet 2500x1250 --gap 5 --margin 10 --out nest.dxf` (`--help` lists the rest; `--example` runs the worked example). Exit code 2 means the independent check failed.

## Model

**Reading (`dxf.mjs`, `geom.mjs`).** LINE, ARC, CIRCLE, LWPOLYLINE and POLYLINE (bulge = tan of a quarter of the included angle, positive counter-clockwise, per the Autodesk DXF Reference), ELLIPSE (flattened), SPLINE (de Boor on the control points, rational or not, refined until each span's midpoint sits within the tolerance of its chord; fit-point-only splines are joined with lines and flagged), INSERT and MINSERT of blocks (base point, unequal scales, rotation, arrays, nested up to 8 deep), and the arbitrary-axis rule for entities drawn with extrusion (0, 0, -1), which are mirrored in x. Text, dimensions, hatches and points are counted and skipped; binary DXF is refused with an instruction. Loose edges are chained end to end (ends within about a millionth of the drawing's size join). Each closed outline at even depth is a part; outlines directly inside it are its holes; an outline inside a hole is a part of its own; open lines inside a part ride with it on the MARK layer. Area and cut length are exact for lines and arcs (shoelace on the chords plus each arc's circular segment).

**Nesting (`nest.mjs`).** Every part, at every allowed turn, is rasterised on a square grid (cell about 1/1250 of the sheet's long side, rounded to 1, 2 or 5 x 10^n) *conservatively*: a cell is busy if an edge passes through it or its centre is inside the material, so the busy cells always cover the shape, and holes stay free. A placed part reserves its cells grown by k = ceil((gap + 2 tol) / res) in every direction, where tol is the arc flattening tolerance (default 0.01). Busy cells k + 1 apart are at least k x res apart and the true curves lie within tol of their chords, so real parts keep at least the gap; the sheet margin follows the same way. Parts go in largest first; each copy takes the first sheet where it fits, at the turn and position that keep the sheet's used length shortest, then the part's right edge leftmost, then lowest, so the offcut is one strip at the far end. Collision tests use per-row "previous busy cell" and "next free cell" tables, so a blocked candidate jumps past the obstacle rather than stepping cell by cell. Four orders are tried (by raster area, by longest side, and two seeded shuffles of the first) and the result with fewest unplaced parts, then fewest sheets, then the shortest last sheet is kept. Then an optional search (`searchIters`; the page's default is 60 tries, the CLI's `--search N` is 0 unless set) mutates the best order, swapping two copies of different parts or moving one earlier, and keeps the change when the nest is no worse; it uses a fixed seed, so the same job gives the same nest, and a try that can no longer win is abandoned part-way.

**Checking (`verify` in `nest.mjs`).** After nesting, a second routine with no raster re-transforms every part's edges, re-flattens them, and measures the distance between every pair of placed outlines segment by segment (and whether one lies inside the other's material), and every outline's distance from the sheet edge. The page and the CLI print the result; the CLI exits 2 if it fails.

**Report.** Per sheet: parts, used length (to the last part), utilisation of the sheet and of the used length, cut length (outlines plus holes) and pierces (one per closed contour and per open MARK line). The area bound, ceil(parts' area / usable sheet area), is the fewest sheets any nester could use.

## How it was checked

- `dxf.test.mjs`: bulge arcs against the DXF Reference definition (bulge 1 is a counter-clockwise half circle; tan 22.5 degrees a quarter); the example flange's area and cut length against the hand calculation (200 x 200 less four R20 corner losses, a 110 bore and four 14 holes); LINE and ARC entities chained into a slot (area 100 x 20 + pi 10^2); extrusion mirroring; INSERT base point, scale, rotation and MINSERT arrays; ellipse area within the chord error of pi a b; a quadratic B-spline through its Bezier midpoint; binary DXF and open outlines refused; an island in a hole is its own part; R12 arcs written counter-clockwise from group 50 to 51.
- `fixtures.test.mjs`: three DXF files written by [ezdxf](https://ezdxf.mozman.at/) 1.4.5 (R2010 and R2000: LWPOLYLINE with bulges and an arc notch, ELLIPSE hole, bulged slot, POLYLINE/VERTEX plate, clamped cubic SPLINE closed by a line, a block inserted rotated, scaled 1.5 and mirrored), with each part's area as ezdxf computes it (`check/make_fixtures.py`). This reader matches all six parts within 0.05%, and each file nests with the check passing. ezdxf's own `set_closed` periodic spline was left out: ezdxf flattens it outside the valid knot range (a 290 x 400 curve from a 110 x 90 control hull).
- The nested DXF output was opened with `ezdxf.readfile` (strict) and `ezdxf.recover` with 0 errors and 0 fixes.
- `nest.test.mjs`: the raster covers every sampled interior point of 40 random polygons at random cell sizes; 100 x 50 parts tile a 1000 x 500 sheet exactly (100 parts, one sheet, 100%); with a 10 mm gap 36 parts of 100 x 110 fit (9 x 4 by hand) and the 37th opens a second sheet; a disc nests inside a ring's hole on a sheet too small for them side by side; oversized parts are reported with the reason; turning lets a long part fit; the edge margin holds; `verify` catches a 3 mm gap where 5 was asked, a part off the sheet, and a part inside another; six random irregular jobs at random gaps, margins, grids and 45 degree turns all pass `verify`; the worked example (72 parts) nests on one 2500 x 1250 sheet with the expected 206 pierces; a nested sheet written as DXF reads back as the same parts and area; CSV cells that start like formulas are neutralised.

- **Against the state of the art** (`eval/esicup-strip-2026-11-22.md`, `eval/esicup-strip.mjs`): the 23 ESICUP strip-packing instances (as packaged by [sparrow](https://github.com/JeroenGar/sparrow), MIT) against sparrow's best published strip lengths. Pre-registered split: tuned on gardeyn0-9, judged once on the 13 classic sets. On the held-out 13 the record's length was on average 0.807 of ours without search (our strips about 24% longer) and 0.836 with 100 search tries (about 20% longer); no instance got worse and all 46 nests pass `verify`. The gap is widest on interlocking concave parts (jakobs2, swim, shapes).

Not checked: a real shop's DXF exports from SolidWorks, Fusion, Inventor or a machine's CAM (the fixtures come from one library), sheet counts against a commercial nester's on a real job, or a real cut. The worked example's parts are made up.

Spec sources: the Autodesk DXF Reference (group codes, bulge, arbitrary-axis algorithm, ARC angle direction); the person who signs a nest off is the machine operator or CAM programmer, who checks it in their CAM before cutting.

## Not modelled

Common-line cutting, lead-ins and lead-outs, kerf compensation (the CAM does it; set the gap to at least the kerf plus what the material needs), cut order and heat, micro-joints and tabs, grain beyond 0/180 degree turns, remnants and non-rectangular sheets, mirrored parts, mixed sheet sizes in one job, files in different units (the page warns).

## Privacy, usage counting and licence

Everything runs in the browser; drawings are never uploaded. Anonymous feature events (`dxf_loaded`, `example_loaded`, `sheets_nested`, `dxf_downloaded`, `csv_downloaded`) are counted in local storage only, with an off switch on the page; Do Not Track and Global Privacy Control are honoured.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not engineering, fabrication or financial advice, and it does not replace your CAM software's checks or a qualified operator. **You are responsible for reviewing and verifying its output before relying on it**, including every nest before you cut it. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

MIT licensed (`LICENSE`).
