# @jobshop-quote/cad-features

Part geometry for job-shop quoting, from the files customers attach to an RFQ:

- **DXF** (ASCII) flat patterns: outer perimeter, gross/net area, blank size, holes (round with
  diameters, slots, other cut-outs), cut length, pierce count, bend lines (from a `/bend/i` layer,
  or dashed lines as a low-confidence fallback), etch length.
- **STEP** AP203/AP214/AP242 solids: bounding box, volume for plane/cylinder/cone solids,
  cylindrical holes and bosses by diameter, and hole locations (`holeAxes`: hole walls grouped by
  axis line, so a counterbored hole is one location with two diameters). Limits and options for full STEP: `docs/STEP.md`.
- **STL** triangle meshes, binary or ASCII (a binary file is recognised by its size, since its
  header may itself start "solid"): bounding box, surface area (`mesh.surfaceArea`), separate
  pieces as bodies, and the volume of a closed mesh (signed tetrahedra about each body's low
  corner). An STL has no units: they are always assumed (`assumeUnits`, default mm) and flagged
  `units-unknown`. A mesh with a gap, a T-junction or a flipped triangle gets no volume
  (`surface-model`, saying how many edges); an inward-facing one fails `volume-failed-check`. No
  holes: a mesh has no cylinders, and the facets sit inside curved faces (`approximated-curves`).

- **IGES** (ASCII, fixed 80-column, 5.x): units from the Global section (unit flag, or the unit name
  under flag 3; the model-space scale applied and flagged), the bounding box, and holes and bosses
  by diameter with hole locations, as for STEP. See "IGES" and "IGES holes" below.

Pure TypeScript, **zero dependencies**, no Node APIs. It runs in a Cloudflare Worker, a browser or
Node 22+.

```ts
import { extractFeatures } from "@jobshop-quote/cad-features";

const f = extractFeatures(await file.arrayBuffer(), file.name); // PartFeatures
f.flat?.cutLength;          // mm
f.solid?.totalVolume;       // mm³ or null
f.confidence;               // "high" | "medium" | "low"
f.fieldConfidence.holes;    // per-measure confidence
f.flags;                    // [{ code, message }]: why a number may be off
```

All lengths come out in **mm** (areas mm², volumes mm³). `sourceUnits` and `unitsAssumed` say
what the file declared. When a DXF has no `$INSUNITS`, pass `assumeUnits: "in"` for imperial
shops. Options: `assumeUnits`, `bendLayer`, `etchLayer`, `ignoreLayer` (see `src/types.ts`).

Anti-guessing rule: a measure the parser cannot get right is `null` or missing, and a flag says
why. It never returns a plausible-looking guess. Confidence drops on assumed units, tessellated
splines and ellipses, several outlines in one drawing, open chains, unsupported entities or
surfaces, and assemblies whose placements are not applied.

## Commands

```bash
pnpm test        # node --test (Node 22.18+ runs the .ts directly)
pnpm typecheck
node scripts/measure.ts some-part.dxf other.step   # print PartFeatures as JSON
```

## Measured on public files

`test/public-samples.test.ts`, with sources and licences in `test/fixtures/public/SOURCES.md`.

| File (licence) | Result | Checked how |
|---|---|---|
| CadQuery `red_cube_blue_cylinder.step` (Apache-2.0, metres) | cube 1000 mm³, cylinder 785.397 mm³ (π·5²·10 = 785.398), box 25×10×10 | by hand |
| build123d `nema-17-bracket.step` (Apache-2.0) | 7061.159 mm³, box 35×41×51, 4× Ø3.3 + 1× Ø32 holes (5 hole locations), 13 partial cylinder faces (bends/fillets) | volume unchanged under translation; not cross-checked with another kernel |
| build123d `M6-1x12-countersunk-screw.step` (Apache-2.0, not committed, 503 KB) | box 10.23×10.23×12; volume **not computed** (surface of revolution and B-spline faces), flagged | flags only |
| build123d `squareandcircle.dxf` | net 21.460 mm² (100 − 25π), Ø10 hole; units not declared → flagged | by hand |
| build123d `closedlwpolylinebug.dxf` | triangle block inserted at 2×3: area 300, perimeter 86.056 | by hand |
| CadQuery `vslot-2020_1.dxf` | 20×20 blank, Ø4.2 bore, net 162.526 mm², perimeter 151.547 | blank and bore by inspection; area is a regression value |
| CadQuery `genshi.dxf` | spline outline 1024.4 mm², flagged as approximated | regression value |

Authored fixtures (`test/helpers/*-writer.ts`) cover exact cases. STEP: box, Z and X holes,
counterbores (one location, two diameters), countersink in radians and degrees, inch and metre units. DXF: holes, slots, chained lines/arcs
in inches, rotated, scaled and mirrored block inserts, bend lines by layer and linetype, etch and
dimension layers, nests, islands, open chains, a rational spline circle, binary DXF.

Not supported yet: binary DXF, DXF 3D entities (3DFACE, 3DSOLID/ACIS, MESH: counted in
`unsupported`), bend angle and direction, IGES volume, compressed or binary IGES, assembly placement transforms, holes from an STL
mesh, and coloured/multi-material STL attributes (the 2-byte attribute word is ignored).

STL is tested on authored meshes only (`test/helpers/stl-writer.ts`: boxes, a 64-sided prism
against its exact faceted volume, a part 10 m from the origin in float32, open, flipped,
inward-facing, degenerate and two-piece meshes); no public STL file is in the fixtures yet.

## IGES

`extractIges` (`src/iges.ts`) measures the box of the faces most CAD systems export: trimmed
surfaces (144, and 143 bounded surfaces), B-rep solids (186 → 514 shell → 510 face → 508 loop → 504
edges), free-standing surfaces and wireframe curves. A trimmed face's surface is usually larger
than the face, so the untrimmed surface is never the answer:

| Face | Measured from | Exact? |
|---|---|---|
| Ruled surface (108 plane, 118, 122, 190-194, a B-spline linear in one direction, a 120 revolving a line) | its model-space edges (142 CPTR, 141 curves, 504 edges), or its (u, v) trim mapped through a B-spline surface when there is no model curve | yes: a ruled surface cannot reach past its edges |
| B-spline surface (128) with (u, v) trim loops, or untrimmed | its edges plus a grid over the domain kept inside the outer loop and outside the holes | to the grid (6 steps per knot span, up to 48 per direction) |
| Any other curved face (120 revolving an arc, 196, 198, a 128 whose loops do not close) | its edges, checked against an outer bound (control points, the full sweep, the sphere or torus) | when the outer bound stays inside the box; otherwise `bbox-may-underestimate` says on which axis and by how much at most, and the box drops to `low` |

Curves are sampled along the real curve: lines, arcs and ellipses (with each axis's exact
extreme), copious data, parametric splines (112, exact extremes per cubic) and rational B-splines
(126). Each entity's own 124 matrix is applied, chained. Left out: parameter-space curves, the
curves that define a surface (a revolved surface's axis and generatrix), annotation, definition,
construction and blanked entities, points. Not applied, and flagged: a grouping entity's own matrix
(`assembly-placement-ignored`) and subfigure instances (408). No volume (`volume-unsupported`: IGES
does not say the faces close a solid); holes are read separately ("IGES holes"). Files over 200,000 entities are refused, and
interior sampling stops after 400,000 surface evaluations per file (`expansion-limit`): a 14 MB file
of 3,000 trimmed bicubic faces measures in about 0.6 s on Node.

Tested on authored files only (`test/helpers/iges-writer.ts`): units, Hollerith strings with
delimiters inside, D exponents, CRLF and unbroken files, arcs turned by a matrix, a rational
quarter circle, a 1 m plane trimmed to 20 × 10, the same trim with no model curve, a B-spline dome
whose top its edges never reach, a hemisphere bounded only by its rim (flagged, not guessed), a
B-rep solid, and annotation left out. No exporter's file is in the fixtures yet: one from a public,
permissively licensed project is the next check.

## IGES holes

`igesCylinders` (`src/iges.ts`) finds the cylinders among each body's faces (a B-rep solid, or all
the trimmed surfaces): 192 cylindrical surfaces, 120 surfaces of revolution whose generatrix is a
line parallel to the axis, and 128 B-splines that sample as a cylinder (straight one way, a circle
the other, checked on a 7 × 7 grid). Faces on one axis line with one radius are grouped, and a
group whose edges wrap at least 330° is a full cylinder (edges are sampled, so a full circle shows
gaps of up to one sample step; fillets and slot ends wrap 180° or less and count as
`partialCylinderFaces`). Full hole cylinders on one axis make one `holeAxes` location, as in STEP.

IGES does not say which side of a face is material, so a ray decides. From a point just inside the
wall (0.98 r) and one just outside (1.02 r), rays run both ways along the axis and count the faces
they cross: planar faces exactly (the crossing point tested against the face's edge polylines,
inner loops included) and cone faces on a parallel axis exactly (countersinks, chamfers, drill
points). Parallel cylinders are never crossed. A ray that passes through the box of any other
curved face is not counted. Odd means material. The wall is a hole when the inside is air and the
outside material, a boss the other way round; both sides the same, or the two directions
disagreeing, means the faces do not close a solid there. Up to fifteen probe points are tried
(five heights, three angles); the first clear from both ends on both sides decides, and probes
that disagree leave the cylinder unclassified (`hole-sense-unknown`, never counted as a hole).
`fieldConfidence.holes` is `high` when every full cylinder was decided from both ends, `medium`
when some were decided from one end or left unclassified, and `low` when none could be.

Checked on Open CASCADE's own IGES output (`test/iges-holes.test.ts`; the parts are designed in
`scripts/make-iges-fixtures.py`, so every size is known by construction, and the files are in
`test/fixtures/occt/`, gzipped):

| File | Written as | Read |
|---|---|---|
| `bracket-faces`, `bracket-brep` | trimmed 120 cylinders; B-rep 192 cylinders | through, counterbored, blind and cross holes and a hole in a boss: all six locations and the Ø20 boss, `high` |
| `block-faces`, `block-brep`, `block-nurbs-faces`, `block-faces-in` | the same part as 120, 192 and 128 (every face a B-spline) faces, and in inches; rotated 30° and 10° and moved | drilled (118° point), countersunk, chamfered and side holes, R5 fillets as partial; `medium` (one hole's rays are blocked one way by the side hole crossing it) |
| `shaft-faces` | a turned shaft along X | three shoulder bosses and the bore; the Ø6 cross hole through the round is unclassified (its rays cross the outer cylinder where the hole trims it, which is not checked) |

A 2.4 MB plate with 400 Ø5 holes reads in about 0.5 s on Node. Not checked yet: another exporter's
files (SolidWorks, NX, Fusion), cones written as 128 B-splines (they block rays rather than being
crossed exactly), and cylinders whose 124 matrix is not a rigid motion (left out).

