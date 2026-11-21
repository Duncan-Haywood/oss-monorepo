---
title: "A kitchen cabinet bigger than its own box: what drawing an IFC model caught in its quantities"
seo_title: "Overlapping IFC body items counted twice in quantity takeoff"
date: 2026-11-21
tags: [construction, bim, ifc, quantity-takeoff, geometry]
description: "A 3D check showed a 600 x 600 x 2100 mm cabinet taken off at 1.37 m3. The fix: an IFC body's overlapping items are one solid, counted once."
---

Earlier today [IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/)
started drawing models in 3D from the same solids its volumes come from
([the post](2026-11-21-drawing-an-ifc-model-from-the-solids-you-measured.md)).
That gives a check for free. The volume the drawn triangles enclose should
equal the volume the takeoff computed. On 11 public models it did for 9,184
of 9,314 elements. This post is about the other 130.

## The cabinet

The worst were kitchen units in a Revit school model (ARK_NUS_skolebygg,
from the web-ifc test files). The drawing enclosed 56% of the computed volume.
One of them is named "Høyskap, kjøkken 600 x 600 x 2100mm", a tall kitchen
cabinet. Its bounding box holds 0.756 m3, and the takeoff said **1.368 m3**.
No 600 x 600 x 2100 cabinet holds 1.8 times its own box.

The drawing was right. An IFC shape representation can list several
items, and this cabinet's carcass, shelves and door are separate extrusions
that run into each other. The takeoff added the items' volumes, so wherever
two overlapped, that material was counted twice. A random-point count over the
geometry (400,000 points) settled it. Points inside two items: plenty. Points
inside three: none. The volume of the union: 0.76756 m3, against 0.76780 for
the drawing.

The same thing on a small scale: the IfcOpenHouse door's 860 mm leaf runs
10 mm into each of its 80 mm posts. That is 2 x 10 x 30 x 2120 mm3 = 1.27
litres counted twice: 88.23 L reported, 86.96 L of material.

## The fix

The takeoff keeps every solid as a signed sum of convex pieces, so a union
is exact and cheap: A + B - (A n B), where the intersection is each pair of
overlapping convex pieces clipped against each other, with the signs
multiplied. The takeoff already did this for an explicit boolean UNION. Now a
body's items are joined the same way. Pairs whose boxes do not overlap are
skipped, items that only touch add nothing, and an item that would need more
than 4,000 extra pieces keeps the old sum and says so on the element.

On the school model 196 volumes changed: furnishings 16.1 to 9.2 m3, windows
-4%, proxies -3%. On the other ten models nothing changed except that one
door: on these models no wall, slab or member had overlapping items. The
stored-vs-computed report came out identical on every model.

## Two more bugs the check found

- **A cut 5 micrometres off the face it trims.** A Tekla beam's end cut sat
  at x = 0.000005 mm, and the mesher's "do these overlap" test had a
  1-nanometre tolerance. So the cut never split the end face, and the drawing
  showed 126,000 mm2 of end where there are 70,000. This one was the
  picture's fault.
- **Volume about the wrong point.** While checking the union, one railing's
  volume went *up*, which a union cannot do. Some of its pieces were left
  open by about 1e-4 by rounding in a clip. The volume formula (the
  divergence theorem) was taken about the model's origin, 230 m away, and
  that distance turned a hairline gap into millions of mm3. Taken about each
  piece's own corner, the railing matches the random-point count (0.49314
  vs 0.49315 m3). That change on its own moved 6 Tekla columns by 0.2%,
  also towards the point count.

After all three: **9,310 of 9,312** elements' drawings enclose their
computed volume. The two left are Tekla beams at 0.51% and 0.53%, just
past the line.

## Why it matters to an estimator

Furniture volume rarely goes on a bill of quantities. But the same rule
covers anything modelled as several solids: a precast unit with a
separately modelled nib, a door frame and its leaf, a steel member drawn
with its plates. When the parts overlap, a takeoff that adds them overstates
the quantity, and you can't see that in a table. Here the picture showed it.

The full numbers, scripts and per-element lists are in
[eval/item-union-2026-11-21.md](../../ventures/ifc-quantity-takeoff/eval/item-union-2026-11-21.md).
The tool is free and MIT licensed, and it runs in your browser; the model
never leaves your machine. Its figures are estimates to check against your
own measurement, not a substitute for it.
