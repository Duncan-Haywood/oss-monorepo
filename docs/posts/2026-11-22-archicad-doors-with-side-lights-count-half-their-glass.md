---
title: "ArchiCAD doors with side lights count the leaf's glass, not the side lights'"
seo_title: "ArchiCAD IFC door Net Volume: side-light glass left out"
date: 2026-11-22
tags: [ifc-quantity-takeoff, ventures, bim, archicad]
description: "Four ArchiCAD doors with side lights store a volume that keeps the leaf's glass and drops the side lights'. Grouping panes by plane names it, 4 of 4."
---

Yesterday's post found that ArchiCAD windows in a public model store their
`Net Volume` as the frame without the glass. That explained 77 of 81 windows
and doors. Four doors were left over, all one library part, "D2R 2zl 18".
Their stored figure was about 9% under the body, but not as far under as
"body less all the glass".

The name gives the hint: *2zl* is Dutch shorthand for *twee zijlichten*, two
side lights. Each door's glass sits in two planes. The leaf's panes are 24 mm
thick, 18 to 42 mm into the frame. The side lights are in the fixed frame at
either end, 28 to 4 mm on the other side. Take only the side lights' glass
off the body and you get the stored figure:

| Door | Body m3 | Side lights m3 | Body less side lights | Stored |
|---|---:|---:|---:|---:|
| #346870 | 0.328244 | 2 x 0.013674 | 0.300896 | 0.300896 |
| #406457 | 0.335223 | 2 x 0.013674 | 0.307875 | 0.3079 |
| #968920 | 0.290780 | 2 x 0.013722 | 0.263336 | 0.2633 |
| #971345 | 0.290780 | 2 x 0.013252 | 0.264276 | 0.2643 |

The last two doors are the same model of door with different side-light
panes, and the stored figure follows the panes.

## Why not "any subset of the panes"

The obvious rule is to try every subset of a door's panes and see if one
matches. With six panes that is 64 guesses, and at a 0.5% tolerance one of
them will hit by luck too often. So the takeoff groups panes by plane first:
same thinnest axis, both faces within a tenth of the pane's thickness. A door
with two planes gives two guesses, not 64. All four doors land within 0.02%.

A planted test checks the opposite case too. A door with two panes in the
*same* plane, storing a figure that leaves out only one of them, stays
unexplained.

## What changed

Across the 13 public models, unexplained stored NetVolumes went from 6 to 2.
Running the old code and the new on the same files, these four doors are the
only lines that change. In a bill of quantities they now sum their whole
bodies, 1.245 m3, where before the stored 1.136 m3 was trusted.

The two left are zinc copings. Their stored section is 410.6 mm2 (the file
stores the end area as exactly twice that), but the profile ArchiCAD
exported encloses 396.3 mm2. I tried the arcs drawn the other way, chords
instead of arcs, and a dropped fold, and none of them gives 410.6. Without a
second export of that profile, there is no rule to name, so they stay
unexplained. The bill of quantities already uses the geometry for them.

The whole check, with the data and how to rerun it, is in
[`eval/side-lights-2026-11-22.md`](../../ventures/ifc-quantity-takeoff/eval/side-lights-2026-11-22.md).
The takeoff runs in the browser; see its
[README](../../ventures/ifc-quantity-takeoff/README.md). It is
an estimate from the file's own geometry, not a substitute for a quantity
surveyor's check.
