---
title: "The grid an ifcXML file leaves out, read back from the knots"
date: 2026-11-18
tags: [bim, ifc, ifcxml]
description: "ifcXML writes a B-spline surface's control points as one flat list. The knot counts give the grid back, and one more STEP/ifcXML twin now reads the same."
---

A B-spline surface in IFC keeps its control points as a grid: a list of rows,
each row a list of points. STEP writes that shape out in full:

```
#122= IFCBSPLINESURFACEWITHKNOTS(3,1,((#123,#124),(#125,#126),(#127,#128),(#129,#130)),
  .UNSPECIFIED.,.F.,.F.,.U.,(4,4),(2,2),(0.0,1224.74),(3.0,4.0),.UNSPECIFIED.);
```

The ifcXML twin of that file, one of buildingSMART's IFC4 Annex E examples,
writes the same eight points as one list, one `<IfcCartesianPoint>` after
another inside `<ControlPointsList>`. Nothing in the XML says where a row
ends. The [IDS model checker](../../ventures/ids-model-check/README.md)'s
ifcXML reader used to keep the list flat, because it had nothing to cut it
by. So on our 43 STEP/ifcXML twins, six surfaces could never match their STEP
side.

The surface's knot data carries the answer. A B-spline of degree *p* whose
knot multiplicities add up to *M* has *M − p − 1* control points in that
direction. For this surface, U has degree 3 and multiplicities (4, 4), so
8 − 3 − 1 = 4 rows. V has degree 1 and (2, 2), so 4 − 1 − 1 = 2 points per
row. That makes 4 × 2 = 8 points, which is what the file holds. The reader
now cuts the list that way, rows in U and points in V, the order STEP uses.
It cuts the rational subtype's weights into the same grid. When the counts
do not multiply out, the list stays flat and the model's notes say so, so the
reader never guesses a grid.

Re-run on the same pinned files:

| | before | after |
| --- | --- | --- |
| twin pairs identical as graphs | 12 of 43 | 13 of 43 |
| GlobalId-paired attribute values identical | 5,695 | 5,702 of 5,782 |
| IDS verdicts identical | 129 of 129 | 129 of 129 |

`basin-advanced-brep` went from 17 entities found only on one side to none.
The cube's four surfaces still differ, but now the file is the cause: STEP
writes `SelfIntersect` as `.U.` (unknown), and the ifcXML writer turned that
into `false`. That is the same unknown-to-false loss we found on
IfcMaterialLayer.IsVentilated.

No IDS check today reads a control point, so no verdict changed. The gain is
the reader's own: an ifcXML model now gives the same geometry graph as its
STEP twin, so anything built on top of it, such as the inventory, the
attribute ranges or a future geometry check, starts from the right shape.
The measurements and the command that reproduces them are in
`ventures/ids-model-check/eval/ifcxml-twins-2026-11-18.md`.
