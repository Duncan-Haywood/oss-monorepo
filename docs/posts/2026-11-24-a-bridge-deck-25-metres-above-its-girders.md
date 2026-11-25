---
title: "A bridge deck 25 metres above its girders: reading a second IFC 4.3 bridge exporter"
seo_title: "IFC 4.3 bridge quantities from PGSuper exports, checked"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ventures]
description: "Three WSDOT PGSuper bridges now read in full. Their decks sat 25 m above the girders, and their vertical curves departed from the IFC text three ways."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads
IFC 4.3 bridges: parts placed by station along an alignment, and decks and
girders lofted between cross-sections. Until today it had been checked on
just one bridge, Viadotto Acerno. One bridge means one exporter, and an
exporter's habits are easy to mistake for the standard.

This run found a second exporter: three bridges written by BridgeLink
PGSuper, the Washington State DOT's girder design program. One is a real
interchange ramp, the I-405 / SR 167 flyover. It has 24 girders, a 324 m
curve and a crest. On main, the flyover's bill of quantities listed the
girders and nothing else. The deck and both barriers were "not read",
because PGSuper writes each parabolic vertical curve as an
`IfcPolynomialCurve` and the reader did not draw those.

## Three ways of writing a vertical curve

Drawing the polynomial was the easy part. The harder part was that PGSuper
writes the vertical profile differently from the IFC text in three ways:

- **Lengths are horizontal runs.** A 260.4303 m line at +2.993% starts the
  next segment exactly 260.4303 m further on. Read as a length along the
  line, as the standard says and Viadotto does, it stops 0.117 m short.
- **Parabolas carry their grade in the polynomial, on a level placement
  direction.** The usual reading turns each segment so it starts along its
  placement direction. That tilts every parabola by its own start grade,
  and the second bridge's profile then jumps 9 m. IfcOpenShell 0.9 reads it
  that way too: its curve evaluator agrees with the tilted reading, jumps
  included.
- **Line grades are written as sines.** The direction is (sqrt(1 - g^2), g)
  and the rise is g times the run. Read as a direction, each line ends a
  few millimetres high (17 mm on a 274 m line at 5%).

None of this is guessed from the exporter's name. Each segment is read the
way the file's own next placement shows it, and the takeoff tries each
reading in turn until one lands there. Viadotto's segments still take the
standard's reading. The check that convinced me compares the result with
the file's semantic description of the same profile (start height,
gradients, length). Read this way, the elevations agree with it to 3e-11 m
at every metre on all three bridges.

## The deck was drawn twice as high

With the curves read correctly, the deck volume still came out 0.63% above
an independent integral of its cross-sections. The cause: PGSuper 8.0.3
draws the deck and barrier sections in absolute elevation (y from 20 to
29 m), then hangs them on a curve that adds the elevation again. As written,
the deck floats 25 m above its girders. IfcOpenShell places it there too,
with the barriers at 48 to 51 m over girders at 22 to 25 m. On a crest, a
section hung 27 m above the curve sweeps a bit more volume (Pappus' theorem
again).

So the takeoff now looks for that case. If every section's middle sits
within 3 m of the curve's own elevation, and that elevation is over 6 m, it
moves the sections down onto the curve and notes it on the element. The
check that matters is whether the deck now sits on its girders. It does: a
7 to 20 cm haunch over every girder that could be probed. The flyover's
deck volume now matches the independent integral to 3 parts in 100,000.

## A plan area that does not depend on where you cut

The flyover's deck area came out as 179 m², for a deck of 802 m³. The plan
area had been a single cut through the slab at mid-depth, and a deck that
curves, climbs and has haunches crosses that plane only in places. It is
now measured from the deck's top faces seen from above: 3,399 m². On
Viadotto, spans with the same 314.2 m² footprint had read anywhere from
275.6 to 312.6 m². They all read 314.2 now.

IfcOpenShell 0.9, the usual second opinion, crashes outright on the
flyover's deck, barriers and alignment curve. Its meshes for the girders
are open, so its volumes depend on where you measure them from (172,857 m³
for one girder, about an origin 400 km away). The independent checks here
are the file's own semantic alignment and a Simpson integral that never
calls the takeoff's code.

The full workings, with every figure and the commands to reproduce them,
are in
[eval/pgsuper-bridges-2026-11-24.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/pgsuper-bridges-2026-11-24.md).
Next is a third exporter's bridge.
