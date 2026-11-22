---
title: "Brep walls and walls with no axis: measuring the IFC wall lengths the first pass skipped"
seo_title: "IFC wall Length from a brep or a wall with no Axis"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "Wall lengths for brep bodies and walls with no Axis, checked on 492 walls with known answers: 3,247 of 3,312 public-model walls now measured."
---

Earlier today the free [IDS checker](https://marisstella.app/ids-model-check/)
learned to [measure a wall's `Qto_` Length and Height](2026-11-21-a-wall-axis-is-not-its-length.md)
when the model leaves them out. That only covered walls with a straight
`Axis` curve and an extruded body. Two kinds of wall were skipped: walls
exported as a faceted brep, where the extrusion is gone and only faces are
left, and walls with no `Axis` at all. One public sample, ISSUE_034 HouseZ,
has 140 walls and none of them could be measured.

## Reading a brep the same way

The length is measured on the plane halfway through the wall's thickness:
a horizontal line along the wall, at the level where the wall is longest.
For an extruded body, that line is tested against a few convex pieces. A brep
is a closed shell, often not convex. The quantity-takeoff engine the checker
shares already has a way to break any closed shell into signed tetrahedra.
It fans each face to the shell's centre, and the signs add up to exactly
"inside" or "outside". So the same line test reads a brep with no new
geometry code.

Height is harder. An extruded wall that a roof clips still tells you its
extrusion depth, which is what Revit stores. ARCHICAD stores the clipped
wall's tallest point instead, so the first pass offered no Height for a
clipped wall. A brep has the clip baked into its faces, so the two readings
can't be told apart. The fill now offers a brep wall's Height only when the
top is level along the whole wall. There both conventions give the same
number. A gable wall, or a wall with a slab notch in its top, goes to the
to-fill table for a person to type in.

With no axis, the direction comes from the body. A wall is thinnest across
its side faces, so the length runs at right angles to that face normal.

## Checking it on walls whose answer is known

None of the newly measured walls stores a Length, so the new paths were run
on the 492 walls that do (three Revit and two ARCHICAD exports), with the
axis ignored:

- **Direction from the body:** the same length as the axis reading on 492
  of 492 walls.
- **Every body handed over as closed shells and fanned into tetrahedra**
  (the path a non-convex brep takes): the same length again on 492 of 492.
  The level-top rule offered 419 heights, and all 419 were within 2% of the
  stored figure. It held back 73, the walls a roof, slab or notch cuts.

One guard came out of the tests. An L-shaped body's middle line runs through
one arm only, so a 5 m corner wall read as 0.3 m. A length shorter than the
body is thick is now refused. That dropped four walls the first pass had
measured. None of them stored a length to compare with.

## What it changes

On the 15 public models, 3,247 of 3,312 walls are now measured, up from
2,955. HouseZ went from 0 to 134. On the seven models the new paths reach,
filling `Length` and `Height` from an IDS left 100 walls failing instead of
305. All 3,478 values written read back passing in the checker and in
IfcOpenShell's IfcTester, and no element IfcTester passed before fails
after.

One open question: Revit writes its own wall length into a property set,
measured along the wall's location line. On one French tunnel model the
body is up to a few metres shorter than that figure, on extruded and brep
walls of the same type alike. The fill writes the body's length, as it does
for every wall. Full numbers, and what is left (a cut-top brep wall's Height,
curved walls), are in
[`eval/wall-brep-lengths-2026-11-21.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/wall-brep-lengths-2026-11-21.md).

The checker and its fill run in the browser, and the model never leaves
the machine. They are estimates from the model's geometry, not a surveyor's
measurement.
