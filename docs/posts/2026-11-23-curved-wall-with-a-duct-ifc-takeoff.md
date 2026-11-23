---
title: "The curved wall that failed its volume check had a duct inside it"
seo_title: "Curved IFC walls as triangulated breps: measuring faces with a duct"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "Two curved walls in a public IFC model were refused as leaning triangles. They hide a ventilation duct; measured right, they match their own axis to 0.02%."
---

Earlier today [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
learned to measure a curved wall's side area on the wall's own facets rather
than from a plane cut, which on an arc only catches a chord. It refuses
any measurement that does not add up: the mean of the two faces times the
wall's width has to equal the wall's volume to within 2%.

Two quarter-circle walls in a public school model (ARK_NUS, from the
`engine_web-ifc` test files) failed that check. They are faceted breps whose
curved faces are triangulated, and about a third of the triangles lean a
fraction of a degree off the vertical, so the engine did not count them as
standing. The obvious fix was to loosen that test. When the earlier run tried
it, the outer face came out at 16.6 m2. Revit stores 14.3 m2 on the
identical walls next to them. That is where the run left it.

## The faces were all there

This run checked the shell first. Every one of its 734 edges is met once in
each direction, so it is watertight and consistently oriented. Unrolled
onto the cylinder 2.3 m round the bend's centre, its outward facets cover
exactly 14.343 m2, Revit's figure. Nothing was missing.

Sorting the standing facets by distance from the centre showed what else
there was: a face at 1.95 m facing outward, one at 2.20 m facing inward, both
running from the floor to 0.75 m up, with level faces between them at 0.75 m.
The wall type is "Ventilasjonsrom", a ventilation room wall. **There is a
duct 0.25 m wide and 0.75 m high inside the foot of the wall**, all the way
round the arc.

That explains both failures. The duct's linings face the same way as the
wall's faces, so they had been added to them: 14.34 + 2.30 = 16.6 m2. And
"mean face times width equals volume" only holds for a wall whose section is
the same all the way up. A wall with a hole along its foot can never pass it.

## Two changes

**Which facets are the wall's face.** A facet facing away from the bend that
is not on the outermost radius gets a ray cast outward from its centre. If
the ray passes through more wall, the facet lines a channel inside, and it
goes on neither face. The same holds for the inner side.

**A volume check that allows any section.** The divergence theorem in plan
says half the sum of each facet's plan area times its distance from the
centre is the volume. That holds whenever the other faces are level or run
along a radius, whatever the section does up the wall. A wall now passes
if either check holds within 2%.

The two walls now read 14.336 m2 outside and 11.699 m2 inside. Their own
axis circle (2.0885 m, 90 degrees, 3.97 m high) gives 14.333 and 11.699. They
measure 0.4225 m wide, against the 0.423 m they store.

## A check that was too easy to pass

The new volume check passed two more walls it should not have: two 1.8 m
thick half-ring walls in a tunnel model, built as 258 convex pieces with
cutters among them. A cutter's faces are only the wall's surface where they
touch material, and the divergence theorem holds piece by piece anyway, so the
check passed while the outer face was 6% too large. So the new check only
applies to bodies with no cutters, and those two walls stay refused as before.

Eight faceted tunnel walls in the same model pass the original, stricter
check now that their leaning triangles count. Their measured centre radius
lands within 23 mm of their axis circles.

On four public models, 65 of the 134 walls that bend in plan are now measured,
against 55 before. None of the earlier 55 moved. The ten new ones store no
side area of their own, and the bill gains 265 m2 of wall face on them.

Method, numbers and what it does not show:
[eval/triangulated-arc-breps-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/triangulated-arc-breps-2026-11-23.md).
