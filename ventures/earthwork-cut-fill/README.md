# Earthwork cut and fill calculator

Turn a surveyor's point file into cut and fill volumes. The tool builds a
Delaunay TIN of the existing ground, compares it with a flat or sloped pad or a
proposed-grade TIN, and integrates the difference exactly, triangle by
triangle. It also finds the pad elevation that balances the site after shrink,
and turns what is left over into bank, loose and truckload quantities.

**Live:** https://marisstella.app/earthwork-cut-fill/ ·
[How cut and fill are calculated](https://marisstella.app/earthwork-cut-fill/how-to-calculate-cut-and-fill.html)

## Who it is for

Small site-work contractors, excavation estimators and builders who receive a
point file from the surveyor but have no Civil 3D, Carlson or Trimble Business
Center seat, and today estimate pad dirt with a grid on graph paper or by eye.

## What it does

- Reads point files: comma, tab, semicolon or space separated; a header with
  Northing/Easting/Elevation (or X/Y/Z) names; or headerless PNEZD (the
  data-collector and Civil 3D default), PENZD, NEZ or ENZ. Repeated positions
  are reported and the first is kept.
- Delaunay triangulation (Bowyer-Watson swept in x, coordinates shifted to the
  data's origin so state-plane values keep their precision, then a hull pass
  that restores slivers a finite super-triangle can steal). Optional longest
  edge limit to drop invented triangles on the outside.
- Design: a plane (elevation held at the boundary's centroid, slopes in percent
  rising east and north), or a second TIN of proposed grade. With two TINs each
  existing triangle is clipped against each design triangle it overlaps.
- Boundary: any simple polygon, either winding; the part outside the survey is
  reported, not counted.
- Exact volumes: inside each piece both surfaces are planes, so the depth is
  linear; the piece is split on the zero-depth line and each side integrated in
  closed form.
- Topsoil strip (existing lowered first; strip volume reported apart), shrink
  (bank to compacted), swell (bank to loose), truck capacity.
- Balance elevation: bisection on the pad elevation until cut × (1 − shrink) =
  fill.
- Haul plan (new 2026-11-18): the site is cut into square cells (automatic
  size, at most 900 cells), cut and fill are integrated exactly in each, cut
  that fills its own cell stays there, and the rest is a transportation
  problem: spare cut to cells short of fill (fill counted in bank measure
  through the shrink factor), cost = straight-line distance between cell
  centres. `haul.mjs` solves it exactly with the transportation simplex
  (spanning-tree basis, dual potentials, block pricing, amounts scaled to
  integers) and then checks every arc's reduced cost, so a reported plan is
  *proved* the least total haul on that grid by LP duality. Out come the
  average haul, the haul moment (cu yd·ft and station-yards, or m³·m), every
  cell-to-cell move (map arrows and a CSV), and the centroid-to-centroid
  shortcut beside it, which is always at or under the real least haul (a
  linear function is 1-Lipschitz, Kantorovich-Rubinstein duality). On a site
  whose cut sits in the middle of its fill (a mound in a ring) the shortcut
  says 0 ft where the least average haul is 67 ft (`haul.test.mjs`). Spare cut
  leaves (or missing fill arrives) from whichever cells cost most to haul,
  at no charge in the total.
- Plan-view cut/fill map, CSV summary, CLI:

```
node cli.mjs existing.csv --pad 105.5 [--slope-x 1 --slope-y -0.5 --at E,N]
node cli.mjs existing.csv --balance --shrink 15 [--boundary pad.csv]
node cli.mjs existing.csv --proposed finished.csv [--units m]
     [--strip 0.5] [--swell 25] [--truck 12] [--max-edge 100] [--json] [--csv out.csv]
     [--haul [--cell 10] [--moves 10]]
node cli.mjs --example --balance --shrink 15
```

## How it is checked

- `earthwork.test.mjs` (22 tests): empty circumcircles and hull tiling on
  random sets, 40 seeded sets crowded against the hull edges, a co-circular
  grid; closed-form volumes for a pad on a planar slope, a sloped pad matching
  the ground, an L-shaped boundary in both windings, two planar TINs on
  different shots, topsoil strip, the balance elevation with 20% shrink
  (104.721 against 100 + a/10, a = 100√0.8/(1 + √0.8)); convergence on a curved
  surface; grid method within 1% of the TIN; 5,000 shots in well under a
  second.
- `check/differential.py` (`node check/dump.mjs > sets.json && python3
  check/differential.py sets.json`): on five 800-point sets with state-plane
  coordinates, the triangle sets are identical to SciPy's `Delaunay` (Qhull),
  and cut and fill agree with an independently derived per-triangle closed form
  to 6e-14 relative. Output: `check/RESULT.txt`.
- `haul.test.mjs` (8 tests): the transportation simplex against an
  independent successive-shortest-path min-cost flow on 60 random 2-D
  instances (same optimum, dual gap 0, certificate holds); on a line, the
  optimum equals the area under the classical mass-haul curve
  (∫|cumulative cut − cumulative fill|) on 40 random instances; per-cell
  volumes add up to the whole-site TIN volumes (with and without boundary and
  strip); export and import cases; the mound-in-a-ring case.
- `check/haul_differential.py` (`node check/dump_haul.mjs > haul.json &&
  python3 check/haul_differential.py haul.json`): six grids from the example
  and the mound, up to 850 cells (489 × 362 LP), re-solved as a plain LP with
  SciPy 1.18.1's HiGHS; every optimum agrees to 3e-11 relative. Output:
  `check/HAUL_RESULT.txt`. The 850-cell plan took 0.5 s in Node.
- `page.test.mjs`: the explainer's worked example quotes what the CLI prints.

All tests: `node --test earthwork.test.mjs haul.test.mjs page.test.mjs usage.test.mjs`.

The example data (the "Load a made-up example" button and `--example`) is
generated by `exampleCsv()` and is made up; no real survey produced it.

## Limits

The haul plan is the least *straight-line* haul between cell centres. Real
haul follows roads and ramps, avoids the building pad and pays for grade, so
read the average haul as a floor for pricing, not a route. Dirt moved inside
one cell is counted as moved but not hauled (it travels under a cell
diagonal). The plan minimises volume × distance; it does not know free-haul
limits, equipment, or the order the site has to be built in.

A TIN is only as good as its shots. With no breaklines it cuts straight across
ditches, curbs and ridges between points. It knows nothing about rock,
unsuitable soil, over-excavation or the structural section under slabs and
paving (lower the design surface by it yourself). Shrink and swell factors come
from the soil, not from this tool.

## Next

- Breaklines: honour 3D polylines (constrained Delaunay) so grade breaks shot
  as strings stay edges; read point descriptions as line codes.
- Pad with daylight slopes: grade from the pad edge at a set ratio until it
  meets existing ground, so the tool computes the side-slope quantities too.
- LandXML surface import.
- Haul: barriers (a building pad or wetland the haul must go round) by
  shortest paths on the grid instead of straight lines; a borrow pit or
  spoil site location so export and import are priced too; free-haul limit
  and overhaul station-yards; a 1-D mass-haul diagram along a road
  centreline.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering, surveying or construction
advice, and it does not replace a qualified professional, the engineer of
record or a licensed surveyor. **You are responsible for reviewing and
verifying its output before relying on it**, including before bidding or moving
material. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use this as a
system of record. If a tool needs to survive, export your inputs and run it
yourself.

## Privacy

Everything runs in your browser. Your point files are never uploaded, and there
are no accounts, tracking cookies or analytics vendor. An anonymous counter in
the browser's local storage (`earthwork-cut-fill-usage`) records which features
were used and the day; the checkbox in the footer turns it off.

## Licence

FSL-1.1-MIT, see `LICENSE`.
