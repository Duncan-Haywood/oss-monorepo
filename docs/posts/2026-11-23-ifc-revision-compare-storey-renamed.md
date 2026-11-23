---
title: "A renamed storey made every element look changed: comparing 12 BlenderBIM revisions of a real house"
seo_title: "IFC revision compare: a renamed storey is not 28 changes"
date: 2026-11-23
tags: [ifc, bim, quantity-takeoff, change-orders, blenderbim]
description: "In a public 12-commit BlenderBIM model, one renamed storey flagged all 28 elements as changed. Now the rename is listed once; Revit shows why types differ."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) compares
two issues of a model for a change order: which bill-of-quantities lines
moved, and which elements were added, removed or edited. Until today it had
been run only on Revit exports and on BIMserver test edits. This run found a
public series from another tool: [Tulpstraat](https://github.com/C-Claus/Tulpstraat),
a model of a terraced house in Arnhem drawn in BlenderBIM and committed 12
times between February and April 2024, each commit with a message saying
what changed.

## What held

BlenderBIM edits the IFC file itself, so an element keeps its GlobalId for
as long as it exists. All 11 steps paired every matched element by GlobalId,
and no step reported an element as removed and added again. The report
agreed with the commit messages where they say something checkable: "get
rid of couch" is one IfcFurniture removed, "added beams" is 29 IfcBeams
added. It also shows more than the messages do. In the commit called
"materialen toegevoegd" (materials added), 31 elements were removed: 14
walls, 6 doors and 5 roofs. A commit message is a person's summary, and the
file holds the rest.

## What went wrong

One step listed **all 28 matched elements as changed**, each with "storey:
My Storey → 00_begane_grond". The file shows what happened:

```
before: IFCBUILDINGSTOREY('04vbjRRgXDWOc9F5HsiQf4',$,'My Storey',...
after:  IFCBUILDINGSTOREY('04vbjRRgXDWOc9F5HsiQf4',$,'00_begane_grond',...
```

The storey kept its GlobalId and got a new name. Nothing moved. For 4 of
the 28 elements (two windows, the stair and the WC), the rename was the only
thing listed. So a reader would have opened 4 elements for nothing, and on
the other 24 the storey line was noise next to the real change.

The takeoff now keeps each storey's own GlobalId. A storey renamed under
the same GlobalId is listed once, as "storey renamed", and its elements are
not changed by it: 24 changed and 4 unchanged on that step. GlobalIds only
ever remove a change here and never add one. A re-export can give a storey
a new GlobalId, so the same name under a new id still counts as the same
storey.

## Why types are left alone

The same step renamed the wall type "TYPEX" to "buitengevel" (outer wall)
under its GlobalId. Treating that the same way looked natural, until the
Revit series answered: on Lake Kegonsa, Revit kept one type GlobalId while a
glulam beam's type "5.125x6" became steel "HSS3.500X0.203", and later
"HSS 3.500 x 0.188", a thinner tube. Those are changes someone prices. A
type's name is its specification, so a type renamed under one GlobalId is
listed, and each of its elements still shows a type change, marked "same
type GlobalId: renamed or re-specified".

Both Revit series give the same counts as before on every step. Lake
Kegonsa had a real storey rename of its own (the 0 ft level went from "1st
Floor" to "2nd Floor" when a level was added below), and of that step's 24
storey changes, the one that was only the rename is gone. The other 23 are
elements that really moved to another level.

## Limits

This is one author's model of one house. Materials have no GlobalId in IFC,
so a renamed material still shows as a material change on each element.
Whether a type renamed under one id should count as a change is a call for
someone who prices change orders, and none has made it yet. The method,
the fetch commands and every count are in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/revision-diff-tulpstraat-2026-11-23.md).

*Estimates from the model's geometry, not professional advice. Check
quantities before pricing.*
