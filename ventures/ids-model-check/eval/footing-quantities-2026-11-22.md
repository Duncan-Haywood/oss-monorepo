# Footings' quantities from their bodies (2026-11-22)

**Question.** `Qto_FootingBaseQuantities` holds what a concrete estimate is
priced from: a footing's `Length`, `Width` and `Height`, its
`CrossSectionArea`, and its `OuterSurfaceArea` and `GrossSurfaceArea`
(formwork). The model fill measured a footing's volumes from its body
(`--from-geometry`) and nothing else, so an IDS asking for any of the six on
a model that lacks them left every footing in the to-fill table. Which public
exports store the set, how does their tool measure it, and can the body give
the same figures?

## Where the figures are

An inventory of every `Qto_`/`BaseQuantities` quantity stored on the 28
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` models and the four
`opensourceBIM/IFC-files` exports used since 2026-11-17 (HHS Office MEP,
architect, construction; Schultz Residence), against what
`geometry-quantities.mjs` could offer, found these classes storing quantities
it could not measure: openings (`IfcOpeningElement`: 1,300+ `Width`/`Height`/`Depth`,
ARCHICAD and Revit), footings (88, Tekla), railings' `Length` (68),
assemblies' `Width` (1,051, Tekla's Mini Project) and two stair flights.
Footings came first: they are what a foundation estimate is priced from, and
every one of the six figures is stored on all 88.

Setup: the two Tekla exports that store them, ISSUE_102_M3D-CON (6 pads) and
ISSUE_102_M3D-CON-CD (82 footings), from a blob-less sparse clone of
`ThatOpen/engine_web-ifc` (not committed).

```
node eval/footing-quantities.mjs DIR/ISSUE_102_M3D-CON-CD.ifc DIR/ISSUE_102_M3D-CON.ifc --json eval/footing-quantities-2026-11-22.json   # footing-quantities-2026-11-22.txt
node eval/footing-quantities-fill.mjs <the two> --out OUT                                          # footing-quantities-fill-2026-11-22.txt
python3 eval/model_fill_ifctester.py OUT OUT/hidden/*.ifc   # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0; footing-quantities-ifctester-2026-11-22.txt
```

## How Tekla measures a footing

Every footing body in the two files is faceted (one closed shell). Reading
the stored figures against the body's smallest box (`boxAxis`, the box
flush with its own faces) and its placement:

- **Pads** (65: the box's thinnest side upright, within 8 deg). `Length` is
  the depth (1.2 m on a 14.9 x 7.8 m pad), `Width` and `Height` the two plan
  sides, `CrossSectionArea` the plan section: volume / depth, so a trapezoid
  pad (`TRPZL7800*14885.58*10382.26`) stores 98.54 m2, not its 116.1 m2 box.
  `OuterSurfaceArea` and `GrossSurfaceArea` are both the area of every face,
  as Tekla writes for its members (`eval/member-surfaces-2026-11-22.md`).
- **The others** (23: wall-like parts such as `650*5000`, strips such as
  `2150*1000`, and tapered strips such as `2000*3924`, 14.36 m long whose
  section at mid-length spans a quarter of the box's height). `Length` is the
  longest side of the box, the convention Tekla uses for its cut members
  (`eval/tekla-cut-members-2026-11-22.md`), tapered ones included.
  `OuterSurfaceArea` is every face's area again. The other two are not
  measurements: on all 23 Tekla writes `CrossSectionArea` as `Width x Width`
  (0.4225 m2 on a 0.65 x 5 m section) and `GrossSurfaceArea` as
  `Length x Height` (31.5 m2 on a body whose faces total 69.2 m2).
- **Width** is, on all 88, the box side along the part's own y axis (the
  body's frame), and **Height** the third side. A square plan (the 0.78 x
  0.78 m pads) needs no choice.

## What is offered

`footingLines` in `geometry-quantities.mjs` (run by `addFootingLines` in
`measureModel`):

| Figure | Tekla export | Other tools |
| --- | --- | --- |
| Length | pad: the upright side; else the longest side, when it is 5% longer than the next | none |
| Width, Height | the side along the body's y, and the third (held back if neither side is within 45 deg of y) | none |
| CrossSectionArea | pads that are prisms through their depth (the faces square to it are two ends of volume / depth each, within 1%) | none |
| OuterSurfaceArea | every face's area | none |
| GrossSurfaceArea | every face's area | every face's area |

The total face area is taken only from one closed shell or one convex piece,
never from several pieces that may overlap. Other tools get only
`GrossSurfaceArea` ("the total gross surface area"), the one figure whose
reading does not depend on which side a tool calls its length: no public
export from ARCHICAD, Revit or another tool stores the set to compare.

## Results

Against the stored figures (`eval/footing-quantities-2026-11-22.txt`):

| Kind | Figure | Stored | Offered | Within 1% | Held back |
| --- | --- | ---: | ---: | ---: | ---: |
| pad | Length, Width, Height | 65 each | 65 each | 65 each | 0 |
| pad | CrossSectionArea | 65 | 65 | 65 | 0 |
| pad | Outer, GrossSurfaceArea | 65 each | 65 each | 65 each | 0 |
| other | Length, Width, Height | 23 each | 23 each | 23 each | 0 |
| other | CrossSectionArea | 23 | 0 | - | 23 (Tekla's Width x Width) |
| other | OuterSurfaceArea | 23 | 23 | 23 | 0 |
| other | GrossSurfaceArea | 23 | 23 | 0 | 0 (Tekla's Length x Height; the faces' total offered) |

**482 of 505 offered figures within 1% of Tekla's** (all within 0.09%);
the 23 others are the `GrossSurfaceArea` figures Tekla writes as
`Length x Height` on every non-pad part, checked on all 23
(`grossIsLxH 23 of 23`, `crossIsWxW 23 of 23`).

The fill end to end, every stored `Length`, `Width`, `Height`,
`CrossSectionArea`, `OuterSurfaceArea` and `GrossSurfaceArea` renamed so the
model holds none, and `eval/footing-quantities/footing-quantities.ids.xml`
(the six on every `IFCFOOTING`) filled with `--from-geometry`
(`eval/footing-quantities-fill-2026-11-22.txt`): M3D-CON-CD 469 written in
7.1 s, failing 492 to 23 (the 23 cross sections held back, listed in the
to-fill table); M3D-CON 36 written, 36 to 0. Every written length lands
within 0.09% of the hidden figure, in the model's millimetres. The checker's
read-back passes all 505, and IfcTester takes exactly the 505 written
values from failing to passing with none newly failing
(`eval/footing-quantities-ifctester-2026-11-22.txt`).

## Limits

- One authoring tool, two files from one project. Another Tekla office's
  export would test the pad/strip split and the y-axis rule; an ARCHICAD or
  Revit export that stores the set would show their Length and Width.
- Revit and ARCHICAD often model strip footings as `IfcBeam` or
  `IfcFooting` with an extruded body; the y-axis rule is Tekla's frame and
  is not applied to them.
- Bodies made of several pieces (a pad with a pedestal as two solids) get no
  surface figure.
- Next by size in the inventory: openings' `Width`/`Height`/`Depth`
  (1,300+ stored by ARCHICAD and Revit), railings' `Length` (68).
