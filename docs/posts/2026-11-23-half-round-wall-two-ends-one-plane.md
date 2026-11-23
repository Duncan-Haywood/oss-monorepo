---
title: "A half-round wall has both ends on one plane, and that broke our curved-wall takeoff"
seo_title: "Half-round walls: two ends on one plane"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "Two 180-degree tunnel walls read 5.58 m2 too much outer face. The cause was not CSG cutters but geometry: both ends share one plane through the centre."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) measures
a curved wall's side area on its own facets: it sums the faces plane by plane,
finds the centre of the bend, and sorts each plane into the outer face, the
inner face, or neither (the ends, the reveals). It then checks the result
against the wall's volume before trusting it. Two walls in a public tunnel
model, ISSUE_129 in the web-ifc test set, kept failing that check. They are
half rings, 1.8 m thick, round a 19.3 m axis.

An earlier run blamed the wall's construction. The engine writes a concave
drawn outline as a fan of signed triangles, 362 pieces here and 157 of them
negative, and the run took those negative pieces for cutters whose faces
leaked into the result. That turned out to be wrong.

**What it was.** On a half ring, both end faces lie on the same plane, and
that plane passes through the centre. Summed as one patch, the two ends have
their centroid half-way between them, on the centre itself. Seen from the
centre, a point on the centre faces every way at once, and the test happened
to say "outer". The outer face read 98.36 + 5.58 = 103.94 m2, and 5.58 m2 is
exactly the two ends (2 x 1.8 m x 1.55 m).

The two openings that cut through the ring, one near each end, did the same
thing. Both are cut by the same two planes, one patch north of the centre and
one south, so each pair's centroid sat where a plane of the face would be.

**The fix.** A real facet of a curved face lies round the foot of the
perpendicular from the centre to its plane. Two patches either side of that
foot do not, and neither does a plane through the centre. So each plane's area
now has to stay within 45 degrees of that foot (an RMS distance from its second
moment) before it counts toward a face. Both walls now match their own axis
circle to 0.003%: 98.362 against 98.360 m2 outside, 89.597 against 89.595
inside, 1.7999 m wide against a type thickness of 1800 mm. With their openings
taken out, the faces still close on the net volume to 0.01%.

Across the four public models with curved walls, no other wall's figure moved,
gross or net. The bill gains the side area of two walls that store none:
327.41 m2 gross, 285.42 m2 net, up from a 22.83 m2 chord cut.

What it doesn't show: neither wall stores a side area, so the only check is
against the file's own axis and volume. The 45-degree bound comes from the
geometry, not from fitting it to data. Full numbers and the rerun commands:
[eval/half-round-ends-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/half-round-ends-2026-11-23.md).

The tool is free, MIT licensed and runs in your browser; the model never
leaves your machine. Its figures are estimates to check, not a priced bill.
