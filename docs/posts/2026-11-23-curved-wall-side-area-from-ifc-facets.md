---
title: "A curved wall's side area from its IFC facets: 897 m2 the bill was missing"
seo_title: "Curved wall side area from an IFC model, measured on its facets"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "A plane cut through a wall on an arc gives a chord. Measured on its facets, 45 such walls in public models carry 1,330 m2 of side area, not 434."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) works
out a wall's side area by cutting the wall with a plane through the middle of
its thickness. For a straight wall that cut is exactly the side face. For a
wall built on an arc it is not: the plane catches only a chord of the curve.
A half-circle wall 1 m in radius and 0.9 m high has a 2.83 m2 outer face, but
the cut through it is 0.21 m2.

Yesterday's run taught the engine to spot walls that bend in plan and to keep
the area the model stores for them. That fixed the check, but not the bill.
Most curved walls in the public models store no area at all, so the bill of
quantities was still summing the chord.

## Measuring the faces themselves

A curved wall reaches the engine as a set of flat facets, a degree or so of
arc each. The new code (`curvedFaces`) adds up the standing facets plane by
plane, finds the centre of the bend as the point the facets' normals all
point through, and sorts each facet onto the outer face (facing away from the
centre) or the inner face (facing it). The wall's side area becomes the mean
of the two faces, which for a wall of one height is the centre line's area.
Its width is the gap between the two faces' radii.

It also checks itself. For a wall of one section, the mean face times the
width has to equal the wall's volume. If they miss by more than 2%, the
measurement is thrown away and the wall keeps what it had.

## Checked against the files

Three walls checked against the circles written in their own IFC files, with
nothing taken from the engine:

| Wall | Outer face: file / measured | Inner face: file / measured |
|---|---:|---:|
| dental_clinic #1674 (77 deg arc, ends cut square) | 4.4325 / 4.4325 m2 | 4.4523 / 4.4522 m2 |
| ISSUE_098 #628477 (half circle, r 1.0 m) | 2.8274 / 2.8274 m2 | 2.5447 / 2.5447 m2 |
| ISSUE_098 #1424026 (1 radian, r 6.0 m) | 28.800 / 28.797 m2 | 27.840 / 27.837 m2 |

On a fourth model (ARK_NUS), Revit stores the outer face of each of ten arc
walls, and the measured outer face matches all ten within 0.001%.

The first attempt was wrong in a way worth recording. It allowed a facet to
sit up to 60 degrees off the radius. The dental clinic partitions have their
ends cut square to the grid, about 52 degrees off the radius, so both ends
got counted as outer face, and the centre came out 6 cm off. Since a facet
of a circle faces its centre exactly, the fix was to allow 25 degrees and
refit the centre without the ends.

## What changed in the bill

Across four public models, 134 walls are flagged as bending. 55 pass the
volume check and are measured. The other 79 are refused, not guessed at. In
61 of them the facets don't point at one centre. The one inspected is a
straight wall with rounded ends, whose plane cut was already right. 7 have too
few facets. 11 fail the volume check, mostly triangulated shapes whose
triangles lean slightly off vertical, so the facet sums come out short.

45 of the measured walls store no side area. On those, the bill's wall side
area goes from 434 m2 to 1,330 m2: +645 m2 on one model with Italian wall
types (ISSUE_098), +243 m2 on another (ISSUE_129) and +8 m2 on the dental
clinic. No volume moves. On walls that do store a figure, the stored figure is still the one summed.

The method, the refusal counts and what is still untested (another tool's
stored figure on a curved wall, and the leaning-triangle breps) are in
[eval/curved-side-area-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/curved-side-area-2026-11-23.md).
The tool runs in the browser with nothing uploaded, or as `node cli.mjs
model.ifc`.
