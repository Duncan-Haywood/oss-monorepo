# ifc-engine

A Rust reader for IFC building models (ISO 10303-21 text), built to turn an
architect's model into the wall plan a framing takeoff needs: centre lines
that meet at their corners, wall thickness and material layers, and the
doors, windows and bare openings in each wall, with rough-opening width,
sill and height. Part of the new-home construction programme in
[`../ROADMAP.md`](../ROADMAP.md); MIT licensed.

```
cargo build --release
target/release/ifc-engine plan  house.ifc --storey 2    # JSON, metres
target/release/ifc-engine dxf   house.ifc --storey 2 > plan.dxf
node ../cli.mjs plan.dxf                                 # the framing takeoff
target/release/ifc-engine stats house.ifc               # counts and timings
```

No dependencies. The crate is a library (`ifc_engine::read_str`) plus the CLI.

## Why it exists

The takeoff's JavaScript reader (`../ifc.mjs`) had been tested only on
hand-written files. On the first real models it was given (below), it read
the Duplex model's Level 1 as 20 walls with **no closed exterior loop** and
placed **2 of its 10** doors and windows. Two IFC facts it did not use
explain both:

1. **Authoring tools trim wall axes at joins.** Revit stops each exterior
   wall's axis about 0.21 m short of the corner, or runs it past, so no two
   axes touch. The model *says* which walls meet, and how, in
   `IfcRelConnectsPathElements` (ATSTART / ATEND / ATPATH). The engine
   intersects the two lines for an L, brings a tee's end onto the through
   wall's line, and merges straight continuations (ArchiCAD splits walls)
   into one run.
2. **A door's placement origin is not the edge of its opening.** The model
   links wall → `IfcOpeningElement` → door or window through
   `IfcRelVoidsElement` and `IfcRelFillsElement`. The engine places the
   rough opening from the opening element's own body, projected on the
   wall's centre line. Doors and windows with no such link (most of them in
   the ArchiCAD model) are hosted on the wall whose thickness band their
   body overlaps. When a door stands in the gap between two pieces of one
   straight wall, the two pieces become one run with the door in it.

It also reads what the JavaScript reader could not: full 3D placements,
`IfcTrimmedCurve` axes (lines and arcs), `IfcIndexedPolyCurve`,
mapped items, faceted B-reps and face sets, conversion-based units (feet),
and `IfcMaterialLayerSetUsage`. The layers give the real thickness and the
stud layer's depth ("Metal - Stud Layer", "Wood Stud"), and the layer
set's offset moves the reference line to the wall's centre.

The parser indexes the file once without parsing attributes, and parses
each attribute list only when it is read. Malformed input is skipped and
counted, never panicked on: nesting is capped and placement cycles stop.

## Verification

Two real models from buildingSMART's
[Community Sample Test Files](https://github.com/buildingsmart-community/Community-Sample-Test-Files)
(CC BY 4.0; fetched and sha256-checked by `scripts/fetch-models.sh`, not
committed):

| model | source | size | entities |
|---|---|---|---|
| Duplex Apartment, `Duplex_A_20110907.ifc` | Autodesk Revit 2011, IFC2X3 | 2.4 MB | 38,898 |
| Schependomlaan design model | ArchiCAD, IFC2X3, a Dutch housing block | 49 MB | 714,485 |

**Against IfcOpenShell 0.9.0** (`scripts/agree.py`, an independent geometry
kernel, world coordinates, opening subtraction off), 2026-11-03:

| check | Duplex | Schependomlaan |
|---|---|---|
| walls read | 57 of 57 | 934 of 934 (695 after merging runs) |
| wall base and body height | max diff 0.0000 m (57) | 0.0000 m (593 unmerged) |
| resolved wall ends on the authored axis line | max 0.0074 m* | max 0.050 m* |
| openings by relationship: from / to / sill / height | 36, all diffs 0.0000 m | 60, all 0.0000 m |
| ... on the wall the model names as host | 36 of 36 | 60 of 60 |
| doors/windows hosted by proximity | none needed | 376; extents 0.0000 m from IfcOpenShell's mesh; centre inside the host's mesh for 325 |
| in a roof or slab, not a wall (skipped) | 2 skylights | 14 |
| not placed | 0 | 14 |

\* Non-zero only where the centre line is moved off the reference line on
purpose: by a layer set offset, or to the midpoint of two collinear pieces
that do not quite touch.

Of the 51 proximity-hosted units whose centre is not inside the host's
mesh, 27 are window sub-frames ("stelkozijn") standing in a cavity between
two leaves. 16 went to the inner leaf ("binnenblad") and 11 to the outer
("buitenblad"). A cavity opening needs a lintel in both leaves, and the
engine gives it one host, which is a known gap. 12 are lift doors on the
face of the lift shaft. 3 are roof windows on knee walls, which is
debatable. The rest are doors at a wall's face or end.

**Into the takeoff.** `ifc-engine dxf` feeds `node ../cli.mjs`. On Duplex
Level 1 the exterior walls now form one closed loop (8.383 × 17.383 m on
centre lines), and every door and window lands on its wall (the two
skylights fill the roof and are left out). The takeoff
then stops with framing objections that are true of the model: a door and
a window 0.1 m apart on the exterior walls (too close for separate king
studs), and two partitions that meet their walls 10 mm inside a door's
rough opening. Duplex is masonry with metal-stud partitions, and
Schependomlaan is Dutch masonry with gypsum-block partitions. Neither is a
wood-framed house, so these are reader checks, not a framing result. A
real US wood-framed model is still wanted.

**Speed** (best of 3, same machine; the JS figure is `../ifc.mjs` on one
storey, the engine reads every storey):

| | Duplex 2.4 MB | Schependomlaan 49 MB | peak memory, 49 MB |
|---|---|---|---|
| ifc-engine `plan` | 0.014 s | 1.08 s | 82 MB |
| `../ifc.mjs` (Node 22) | 0.24 s | 4.35 s | 775 MB |
| IfcOpenShell `open()` alone | 0.27 s | 1.82 s | not measured |

Tests: `cargo test` has 9 fixture tests (Revit-style L corners, tees and a
refused far join, millimetres and a raised storey, feet, layer offset,
relationship-hosted openings and a bare opening, a door bridging two
pieces, trimmed-line and arc axes, hostile input) and 6 unit tests.

## Known limits

- Clipping is not applied. A wall's height is its unclipped body's, so a
  gable wall cut by the roof reports its full rectangle.
- Curved walls are reported by their chord, with the arc's radius and length.
- `IfcWallElementedCase` parts (`IfcMember` studs already in the model) are
  not read.
- An opening through a cavity wall is given one leaf, not both.
- Complex instances (`#1=(A()B());`) are skipped and counted.
- IFCZIP and ifcXML are not read.

## Plan

The whole project, as a person would estimate it: about **340 hours**. This
session did the first ~40 (parser, placements, units, walls, joins, layers,
openings, two real models checked against IfcOpenShell). Each milestone
works on its own and is checked on a real model before the next.

| # | milestone | est. hours | check |
|---|---|---|---|
| 1 | Parser, placements, walls, joins, layers, hosted openings (done) | 40 | IfcOpenShell on two real models |
| 2 | WASM build behind the takeoff page's IFC upload (done 2026-11-03: `ifc-engine.wasm`, 272 KB, `ifc-wasm.mjs`; the page's Open plan file takes `.ifc`) | 25 | native and wasm DXF identical on 3 files; Chromium click-check |
| 3 | Half-space and polygonal clipping (`IfcBooleanClippingResult`), so gable and raked walls get their real top line | 35 | IfcOpenShell mesh tops |
| 4 | Stud layer to framing: map the structural layer (material and depth) to stud size per wall, and core-to-core centre lines for corners | 25 | a real US wood-framed model |
| 5 | Slabs, roofs and floor openings (`IfcSlab`, `IfcRoof`), feeding `floor.mjs`, `roof.mjs`, `slab.mjs` | 50 | IfcOpenShell areas |
| 6 | `IfcWallElementedCase` / `IfcMember`: read the studs a model already has, and compare them with the takeoff's layout | 30 | a framed model (e.g. from a framing plug-in) |
| 7 | Parallel indexing and a streaming mode for 500 MB+ coordination models | 20 | memory and time on a large public model |
| 8 | IFC4 / IFC4.3 coverage: indexed geometry, types carrying materials, `IfcDoorType` operation for swing | 30 | buildingSMART IFC4 samples |
| 9 | Fuzzing (`cargo fuzz`) on the parser and the semantic layer | 15 | no crash in 24 h |
| 10 | Quantities out (`IfcElementQuantity` read and written) so a takeoff can be sent back into BIM tools | 40 | round trip through IfcOpenShell |
| 11 | crates.io and a Python wheel (publishing needs the owner's decision on the portfolio's public name) | 30 | install on a clean machine |

Most valuable next: milestone 4 with a real US wood-framed model.

WASM: `cargo build --release --target wasm32-unknown-unknown`, then copy
`target/wasm32-unknown-unknown/release/ifc_engine.wasm` to `../ifc-engine.wasm`.
The module exports a C ABI (`src/wasm.rs`), no wasm-bindgen. `ifc.mjs` stays
for the CLI; `ifc-wasm.mjs` is the page's path (IFC to DXF to `planFromDxf`).
