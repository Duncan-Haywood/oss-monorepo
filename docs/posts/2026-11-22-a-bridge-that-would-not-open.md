---
title: "A bridge that would not open: reading IFC 4.3 alignments for a bill of quantities"
seo_title: "IFC 4.3 bridge quantities: IfcLinearPlacement and sectioned solids"
date: 2026-11-22
tags: [ifc-quantity-takeoff, bim, infrastructure, evaluation]
description: "A public IFC4X3 bridge stopped our takeoff on its first pile. Now all 6,448 parts read, placed within 1e-7 m of IfcOpenShell and measured to 0.003%."
---

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/README.md) turns a
building model into a bill of quantities in the browser. Until this morning it
read buildings only. The one public IFC 4.3 bridge in the test models we use,
Viadotto Acerno (33 MB, 6,448 parts), stopped the takeoff on its first pile
with "object placement IFCLINEARPLACEMENT". Nothing came out at all.

Bridges and roads are drawn differently from buildings. A building places a
wall at x, y, z. A bridge places a pile "79.75 m along the alignment, 33.61 m
below it". The alignment is a chain of straight lines, circular arcs and
clothoids (curves whose bend grows steadily, the transition every highway
uses), with a vertical profile of slopes and 8 km sag curves laid over it.
The deck is not a box either. It is a cross-section given at a few stations
and swept between them, following the curve.

## What it reads now

The new module, [`alignment.mjs`](../../ventures/ifc-quantity-takeoff/alignment.mjs),
walks the alignment's segments and places each part at its station. It then
lofts each deck, girder and pavement layer between its cross-sections. On
the bridge:

- **All 1,101 station placements** land within **1.1e-7 m** of IfcOpenShell's
  (median 3e-12 m).
- **All 638 swept parts** (decks, girders, diaphragms, pavement layers) are
  within **0.003%** of an integral that meshes nothing: the section's area
  times the path of its centroid.
- **Every part has a volume**, 6,448 of 6,448. That includes 3,260 m³ of
  girders and 1,889 m³ of deck, which had no reading before.

The full method and every number are in
[eval/linear-placement-2026-11-22.md](../../ventures/ifc-quantity-takeoff/eval/linear-placement-2026-11-22.md).

## Three things we got wrong first

**The vertical offset.** The first version hung each pile 33.61 m straight
down from the road. IfcOpenShell put it 0.44 m away, along the road. The
IFC 4.3 text decides: the vertical offset is square to the alignment's
tangent, and the road falls 1.3% here. Over 33.61 m that lean is 0.44 m.

**The longitudinal offset.** We read it as extra distance along the curve.
The spec says it is a straight step along the tangent after the other
offsets. On a 400 m arc, the two readings differ by 8 mm.

**The pavement layers.** A pavement layer's crossfall can turn over between
two stations. In the worst case a 4 cm layer's left edge rises 0.26 m in
25 m. Each side face of that loft is then a twisted four-sided patch. Cutting
it into two triangles along one diagonal put the layer's volume 55% off.
Slicing more finely helped only slowly: still 2.4% off at 1 cm slices. Four
triangles fanned about the patch's centre point make it exact.

## Where the file disagrees with itself

The curves can be checked against the file. Each segment's end, as we draw
it, should sit on the next segment's start, which the exporter also wrote
down. On the bridge's own alignment they meet to 7e-9 m through every
clothoid and arc. On the two roads they miss by up to 0.31 m. Those roads'
segment lengths are rounded to the millimetre, and the start points were
never recomputed from them. A takeoff can't fix that, but it can report it.

Twelve diaphragms have a cross-section 0.20 m past the end of the line they
are swept along. We carry the solid on along the end tangent; IfcOpenShell
stops at the end. The file does not say which is meant, so those 12 rows
carry a note rather than a silent choice.

## What it still can't read

It can't yet read cant, the tilt of a rail track, which IFC 4.3 stores as
`IfcSegmentedReferenceCurve`. It also skips the transition spirals other
than the clothoid. A part placed on one of those is now marked "not read"
on its own row, and the rest of the file is still measured. One bridge is a
small sample. A second public IFC 4.3 model would tell us whether the
past-the-end diaphragms are a habit of exporters or a slip in this file.
