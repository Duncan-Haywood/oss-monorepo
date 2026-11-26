# @private/cad-features

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
  under flag 3; the model-space scale applied and flagged) and the bounding box. See "IGES" below.

Pure TypeScript, **zero dependencies**, no Node APIs. It runs in a Cloudflare Worker, a browser or
Node 22+.

```ts
import { extractFeatures } from "@private/cad-features";

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
`unsupported`), bend angle and direction, IGES volume and holes, compressed or binary IGES, assembly placement transforms, holes from an STL
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
does not say the faces close a solid) and no holes. Files over 200,000 entities are refused, and
interior sampling stops after 400,000 surface evaluations per file (`expansion-limit`): a 14 MB file
of 3,000 trimmed bicubic faces measures in about 0.6 s on Node.

Tested on authored files only (`test/helpers/iges-writer.ts`): units, Hollerith strings with
delimiters inside, D exponents, CRLF and unbroken files, arcs turned by a matrix, a rational
quarter circle, a 1 m plane trimmed to 20 × 10, the same trim with no model curve, a B-spline dome
whose top its edges never reach, a hemisphere bounded only by its rim (flagged, not guessed), a
B-rep solid, and annotation left out. No exporter's file is in the fixtures yet: one from a public,
permissively licensed project is the next check.

## Provenance

Moved on 2026-11-26 from `Duncan-Haywood/private-monorepo` `packages/cad-features` at commit
`b1b7c3f63ce289c4051d8506eb0744856350f80e` (a copy of the tree, not its git history), when the paid apps moved
to this public repository. Licence: the root `LICENSE` (FSL-1.1-MIT) unless this
directory's own LICENSE says otherwise; third-party files keep their notices. Index:
[`apps/README.md`](../../apps/README.md).
