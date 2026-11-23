---
title: "Two tools, two different cones: the 0.12% an IFC exporter's B-spline hid"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures, bim, geometry]
description: "One IFC fitting is two solids: polynomial faces 0.042 mm inside circular edges. Our takeoff reads the faces, IfcOpenShell the circles. Both are right."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads
volumes straight from a BIM model's geometry. We check it against
IfcOpenShell, the open-source geometry kernel most IFC tools build on. On two
public models with 2,084 curved breps between them, one disagreement had no
named cause. It was a small cone-shaped fitting in `kleine_Wohnung`. Our
figure was 0.117% lighter than IfcOpenShell's, and meshing finer did not
change it.

**The fitting is two solids at once.** Its caps are flat and bounded by exact
circles, radius 35 mm at the bottom and 15 mm at the top. Its sides are
B-spline surfaces. The file calls them "rational", but every weight is 1, so
each side is an ordinary cubic. No cubic follows a circle exactly. The
exporter's fitted curves stand up to 0.042 mm inside the circles they are
meant to meet.

**We measured both exactly.** Each side face runs straight from cap to cap,
so the area of a horizontal section is a quadratic in height. Three sections
and Simpson's rule then give the exact volume of the faces, with no mesh.

| figure | volume (cm³) |
|---|---:|
| the B-spline faces as written | 413.150 |
| IFC Quantity Takeoff | 413.153 |
| the circular frustum the edges describe | 413.643 |
| IfcOpenShell 0.9.0 | 413.636 |

Our tool reads the faces to within 7 parts per million. IfcOpenShell reads
the circles: its mesh takes its vertices from the circular edges. Neither is
a bug. The file states both shapes, and they differ by half a cubic
centimetre.

**What changed in the tool.** A curved face now records how far its surface
stands off its own edges. When that could move a solid's volume by more than
0.1%, the takeoff adds a note naming the distance and the largest possible
difference. On the two models, 2 of 2,089 breps get the note. Volumes did
not change. The comparison script now calls this case `surface-off-edges`,
so every disagreement with IfcOpenShell on both models has a named cause.

Half a cubic centimetre will not change anyone's bid. A takeoff tool earns
trust when it can show why its numbers differ from another tool's. "Both
are right, about different shapes" is an answer an estimator can check. The
script, the numbers and the test are in
[eval/off-edges-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/off-edges-2026-11-23.md).

*Estimates from the model's geometry, not professional advice. Check
quantities against the drawings before pricing.*
