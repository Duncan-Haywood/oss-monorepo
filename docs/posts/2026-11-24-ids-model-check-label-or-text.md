---
title: "IFCLABEL or IFCTEXT: one Revit property, two data types, 145 rooms failing a check they meet"
seo_title: "Why an IDS check fails Revit rooms: IFCLABEL vs IFCTEXT"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "A Revit export wrote one room property as IFCLABEL on 162 rooms and IFCTEXT on 145, so a check built from the model failed 145 rooms. Now fixed."
---

The [IDS editor](https://marisstella.app/ids-model-check/editor.html) in IDS
Model Check can open a model and write requirements from what it holds. Pick
a property and it lists the values the model has, then **Allow exactly these
values** writes them as a one-of list. A check built that way should pass the
model it came from. Until today that had been measured on four exports.

So we ran the editor's offers over 28 more public models: the test files in
ThatOpen's `engine_web-ifc` repository. They come from ARCHICAD, Revit 2011
through 2022, Tekla and Allplan, plus IFC4X3 bridges and roads, 71,448 objects
in all. Every model read. Attribute ranges passed 151 of 151, attribute
one-of lists 1,704 of 1,704, and property offers 19,296 of 19,300.

## The four that failed

All four came from one model, a Norwegian school exported from Revit to IFC2X3.
Its rooms carry a `Constraints.Level` property: "Plan 01", "Plan 02" and so on.
On 162 rooms the value is written as `IFCLABEL('Plan 01')`. On the other 145
it is `IFCTEXT('Plan 01')`, the same words in a different IFC type. Three more
properties in the file are split the same way.

An IDS property requirement names a single `dataType`, and checkers compare
it exactly. The editor filled in IFCLABEL, so the check it offered failed 145
rooms that hold a perfectly good level name. IfcOpenShell's IfcTester fails
the same 145, so this was not a quirk of our checker. Any tool would have
reported those rooms as faults, and the model's author would have gone looking
for a problem that isn't in the data.

## What the editor does now

The row now gives the count for each type: "written as IFCLABEL on 162,
IFCTEXT on 145. A check with dataType IFCLABEL fails the 145 written as
IFCTEXT." Next to it is an **Accept any data type** button, which writes the
requirement with no dataType. When every type involved is text (IFCLABEL,
IFCTEXT, IFCIDENTIFIER), the value is the same string to every checker, so the
one-of list stays. When a boolean or a number is in the mix (another Revit
export writes "ADA Compliant" as IFCBOOLEAN on 10 objects and IFCLABEL on 8),
checkers read an untyped value differently. The row then keeps presence only
and says why.

With that change all 19,300 offers pass their own model. IfcTester agrees on
all eight specifications we tried, typed and untyped, element for element.

Two smaller fixes came out of the same run. When a specification covers
several classes, the data type the page fills in is now the most common one
across them, not the first one it happens to see. And a note that wrongly told
you "none of the model's objects has this property" on rows where the model
does have it is gone.

## If you write IDS for Revit models

If a property comes from a Revit export, check the type it is written in
before you put a `dataType` on it. The three Revit 2011-era models in this set
also write every `Pset_*Common.Reference` as IFCLABEL, where the standard says
IFCIDENTIFIER, so a check that follows the standard fails every wall, door and
window in them. The editor flags both cases when you open the model. The
measurements are in
[the evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/mixed-type-own-props-2026-11-24.md).

IDS Model Check is free and MIT licensed, and it runs in your browser: the
model is never uploaded.
