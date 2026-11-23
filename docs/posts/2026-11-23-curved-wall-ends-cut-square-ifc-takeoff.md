---
title: "A curved wall with square ends: the volume check that was missing a term"
seo_title: "Curved wall ends cut square in an IFC area takeoff"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "Why a stepped arc wall with square-cut ends failed the volume check on its faces, and the one exact term per plane that fixes it."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
measures a wall built on an arc from its own facets: the outer face, the
inner face, and their mean as the side area. A plane cut through the middle
would give you a chord's elevation instead. Before trusting those two faces,
it checks that they account for the wall's volume. If they do not, some
face was misread, and the wall keeps the cruder chord figure.

For a wall whose thickness changes up its height (a thick base under a
thinner wall, say), the check is the divergence theorem in plan. Pick the
bend's centre C. For every face, take its area times its distance from C
along its own normal, halve it, and add it all up. The total is the volume.
A level face adds nothing. A face along a radius also adds nothing, because
its normal is square to the line from the centre. So if a wall's ends lie
along radii, the outer and inner faces alone should give the volume, and
that is what the check compared.

Real walls are not always cut that way. Revit's dental clinic sample has two
curved partitions whose ends are cut square to the plan axes, at about 52
degrees to the radius. On a constructed stepped quarter ring with both ends
cut at x = 0.6 m, the faces were exactly right, but the check came out 28%
off and refused them. The ends were carrying their own share of the sum. An
end at x = 0.6 sits 0.6 m from the centre along its normal at every point on
it, so its share is its area times -0.3, and it was missing.

The fix is that term. The engine already set aside the standing planes that
face no centre as ends or reveals. It now adds each one's share, which is
exact for a plane because the distance along its normal is the same
everywhere on it. With the ends counted, the check on the square-cut wall
closes to one part in a billion. Its outer and inner faces match the chords
clipped by hand to the same precision, and the same wall written as an IFC
file of two drawn outlines is measured on its facets.

The check still does its job. A wall whose top is raked by a sloped cut has
a face that is neither level nor standing. That face is in neither sum, and
the check misses by 9.8% and refuses the wall. A face patch wrongly dropped
from the outer or inner face is not added back as an "end" either, so a
misread still shows.

On the 28 public models in the engine_web-ifc test set, which include all
four with curved walls, the output did not change by a line. The dental
clinic's square-ended partitions are one section all the way up and already
passed the simpler check. None of these models has a stepped arc wall with
square ends, so the claim rests on constructed walls for now. The method and
numbers are in
[eval/square-cut-ends-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/square-cut-ends-2026-11-23.md).

Quantities here are estimates computed from the model's geometry, to be checked
before pricing; they are not professional quantity-surveying advice.
