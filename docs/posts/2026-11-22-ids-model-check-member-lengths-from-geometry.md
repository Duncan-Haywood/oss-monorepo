---
title: "A beam's length from its geometry: 3,227 of 3,233 stored lengths matched, and where the tools disagree"
seo_title: "Fill missing Qto_ Length on IFC beams and columns from geometry"
date: 2026-11-22
tags: [ids-model-check, ventures, bim]
description: "The free IDS checker now writes a missing Qto_ Length for columns, beams, members and piles. On 10 public exports 3,227 of 3,233 match what the tool stored."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) can write the
values a failing IDS check asks for into a copy of the model. With *measure
from geometry* ticked, it measures missing `Qto_` quantities from each
element's body: volumes, areas, and walls' length and height. Until today it
left a column's, beam's or member's `Length` alone. The code comment said why:
the figure is "nominal", cut ends make it ambiguous, and "no public model here
stores one to check against".

The second half of that comment was wrong. The public exports the checker was
already tested on store 5,079 such lengths. So this run measured them first,
and only then wrote the rule.

## Two readings of one length

A member's body is a profile swept along an axis, sometimes with its ends cut.
You can read two lengths off it:

- the **extent**: how far the body runs along its axis;
- **volume over section**: for a prism cut by planes, that is the length of the
  line through the section's centroid.

With square ends the two are the same number, and every tool stored that
number: 1,649 of 1,649 Revit columns and mullions on the HHS Office models,
108 of 113 ARCHICAD beams and columns, 2,198 of 2,254 Tekla parts.

With cut ends they split, and the tools split too. ARCHICAD stored volume over
section on 16 of 17 mitred beams. For Tekla, the extent matched in 156 of 172
cases. That is good, but not good enough to write into someone's model without
asking: on one file 9 of 13 cut beams were off by about 3%. No public model has
a Revit cut member with a stored length. So the rule is:

- square ends: the extent;
- cut ends: ARCHICAD's figure for ARCHICAD exports, and nothing for every
  other tool. Those go to the to-fill table for a person.

## The plates that look like beams

Tekla exports plates as `IfcBeam`. A `PL6*60` cleat is extruded 60 mm through
its width, and its stored Length is the plate's own 132 mm. Of the `PL` plates
in Mini Project, 221 store the extrusion and 56 store the plate's length, and
neither the name nor the shape tells them apart. So a body that is no longer
along its axis than it is wide across it gets no length. That holds back 808
Tekla beams, most of which the extent would have got right. A wrong length
written into a model is worse than a blank cell someone can fill.

## Results

On 10 public exports (Revit, ARCHICAD, Tekla), 3,909 lengths are offered and
3,227 are within 2% of the stored figure. Of the rest, 676 are on a Revit 2019
school model that writes one figure, 20.858 m, on 653 mullions of different
lengths. Leave those out and it's 3,227 of 3,233. Six misses are unexplained:
four ARCHICAD strip footings, one cut ARCHICAD beam and one Revit beam.

Then the real test. I renamed every stored `Length` in five of the models,
asked the fill for `Qto_*BaseQuantities.Length` on every linear member, and
compared:

- 3,262 lengths written, and 3,189 of the 3,194 that had a stored figure match
  it to within 2%;
- IfcTester 0.9.0 takes the same 3,262 elements from fail to pass.

The method, tables and scripts are in the venture's
`eval/member-lengths-2026-11-22.md`. On the command line it's
`node cli.mjs --fill model.ifc spec.ids -o filled.ifc --from-geometry`. On the
page it's the same checkbox as before. Everything runs in your browser.

Estimates from geometry, not a surveyor's takeoff: check them before you
price from them.
