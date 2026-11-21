---
title: "A wall and its windows are not one wall: fixing an IFC revision change report"
seo_title: "Fixing an IFC revision change report: walls, windows, parts"
date: 2026-11-21
tags: [ifc-quantity-takeoff, ventures]
description: "A 0.12 mm gap in a gypsum layer left 1,048 elements in 22 IFC models with no position, and our change report was pairing walls with their own doors."
---

The free [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
compares two issues of a building model and lists what changed: elements
added, removed, resized or moved, and the change on each line of the bill of
quantities. It matches elements by GlobalId first, then by other evidence,
because real exports often renew GlobalIds. One of the harder cases is Revit
"parts". The same wall can be exported once as a single wall and once as its
separate layers. The report has to see that three layers in the new issue are
the one wall in the old issue, and not one wall removed plus three added.

On five real exports of one house (OpeningDesign's Aalseth Residence), one
short basement wall kept failing that test. Tracking it down turned up two
problems, one of them much wider than that wall.

## A gypsum layer with no position

The wall's three parts add up to 0.1819 m³, against 0.1861 m³ for the wall.
But the report only saw two of them. The third part, a 5/8" gypsum layer, had
a volume but no bounding box, and the parts test only considers elements
whose position it knows.

The reason is a gap. The exporter wrote one top corner of that layer twice,
0.12 mm apart. Once the corner is split, two edges belong to only one face
each, so the shell is "open". For areas, refusing an open shell is the right
call: a section cut through an open shell can't be trusted. But the code also
threw away the shell's points, and the box is measured from those points.

That wasn't one element. In the 22 models we checked, **1,048 of 27,668
elements had no box**, all of them open faceted shells: 133 in one office
model, up to 155 in a single house export. Now an open shell keeps its points
for position and nothing else. Every element in all 22 files has a box, and
no volume or area changed on any of them.

## 2.3% on a short wall

With all three parts in view, the volumes were 2.3% apart, just over the 2%
the test allowed. Layers are trimmed a little differently from the wall at
each end. On a long wall that trim is a fraction of a percent; on a 1.1 m wall
it's more. So a group now gets up to 5% when the parts' boxes together exactly
make the wall's box (every face within 1 cm). Three Aalseth steps now pair the
wall with its layers. Across the four steps, a GlobalId-only comparison
counts 202 records as added or removed that are really the same element.

## The bug the boxes exposed

Giving more elements a box let the report try more groups, so we read every
group it formed on a second house, Lake Kegonsa. Some were plainly wrong, and
three of them were already in the report we published yesterday:

- a wall "split" into a wall and the door in it;
- a wall and a beam "merged" into one wall;
- nine curtain-wall members, an interior wall and a stair stringer "merged"
  into a fireplace trim wall.

With the new boxes, a fourth appeared: a wall split into a wall plus its two
windows. A wall's windows sit inside its box, and their small volume can make
up a volume difference by chance. Real parts always share one class: wall
layers are walls, roof layers are roofs. Groups are now formed one class at a
time. All four false groups are gone. A true one stays: a soffit roof that one
export writes as four slabs (6.4659 m³ against 6.4852 m³).

## A side effect worth having

The envelope test casts rays from each wall to decide whether it's exterior
or a partition. It also uses the elements' positions, so more walls and
railings now take part. Among walls whose authors flagged them, the test
agrees with the flag on 4,459 of 5,522, up from 4,420 of 5,497. One model got
slightly worse (two walls), and we've noted it as the next thing to explain.

Every number above is in the repository, with the commands to rerun them:
`ventures/ifc-quantity-takeoff/eval/open-shell-boxes-2026-11-21.md`. The tool
is free and MIT licensed, and it runs entirely in your browser. Its results
are quantities from the model, not a cost estimate, and no estimator has
reviewed these change reports yet.
