---
title: "88% of the property sets in four real IFC exports are not standard sets"
seo_title: "Write an IDS for the IFC model you have, Revit property sets included"
date: 2026-11-16
description: "The free IDS editor now opens your IFC model and offers the classes and property sets it carries. In four real exports, 347 of 395 were a project's own sets."
tags: [ids-model-check, bim, ifc, ids]
---

The [IDS editor](/ids-model-check/editor.html) we shipped today started from
buildingSMART's templates: pick a class, and it offers the standard `Pset_` and
`Qto_` sets that class *can* carry. That holds up on buildingSMART's own sample
models. We ran it against four real exports and it covered very little of what
they hold.

## What real models carry

We read 39 public models with the checker's own reader and listed, for each
class, the property sets its objects carry. "Pairs" below means one set carried
by objects of one class.

- The 35 buildingSMART sample models (the Simple Scene set in IFC2X3, IFC4 and
  IFC4X3, plus five ISO reference-view files) carry 37 pairs. 23 are standard
  sets.
- Four real exports from the opensourceBIM collection (an office's architect,
  construction and MEP models and a Revit house, 10,766 objects) carry 395
  pairs. **347 of them (88%) are the project's own sets**, mostly Revit's:
  `PSet_Revit_Constraints` on 22 classes, `PSet_Revit_Dimensions` on 21,
  `PSet_Revit_Phasing` on 21.

So an editor that only offers the standard templates leaves out most of what a
BIM coordinator would actually ask about.

One more finding: **21 of the 122 standard-set properties in those exports use
a data type the template does not give**. Examples are `Reference` written as
IFCLABEL where the IFC2X3 template says IFCIDENTIFIER, `NumberOfRiser` as
IFCINTEGER rather than IFCCOUNTMEASURE, and a railing `Height` as a bare
IFCREAL. Under the IDS rules, a specification that asks for the template's
dataType fails every one of those objects, even when the value is there.

## What changed

**Open a model to write for.** The editor reads an .ifc, .ifcxml or .ifczip in a
background thread of the tab. Nothing is uploaded. It lists each class with its
object count and the sets on those objects. From there:

- each class has an *Add a specification* button;
- on a property requirement, the standard sets the model already carries come
  first ("on 112 of 112 in the model"), then the other standard sets, then the
  model's own sets;
- for an own set, the model's property names are offered, and picking one fills
  in the data type the model writes it in;
- the row warns when the model writes a standard property in a different data
  type than the template, and when the model has no objects the specification
  applies to.

**Your own property sets are editable.** Before this change, a requirement on a
set like `Acme_Wall` could not be written in the editor. When an existing IDS
was opened, such a requirement was kept as raw XML. Now it is a normal row with
a set name, a property and a data type. buildingSMART reserves the `Pset_` and
`Qto_` prefixes, and the check is case-sensitive, the same as the IDS audit's
`pset-custom` rule. So Revit's `PSet_Revit_Dimensions` counts as a project's
own set and audits clean, while a misspelt `Pset_WallCommonn` is still kept as
written so the audit can flag it.

We reopened every IDS file in our test corpus and wrote it back. The 64 public
files, the 12 IDS-Audit-tool valid files and the 187 buildingSMART pass cases
all still ask for exactly the same thing. The share of facets in the public
files that open as editable rows went from 75.0% to 79.4%.

## Try it

Open the [editor](/ids-model-check/editor.html), click **Open a model to write
for**, and add a specification from the table. When the IDS is ready, **Check a
model with it** hands it to the [checker](/ids-model-check/). The per-model
numbers and the script that produced them are in
`ventures/ids-model-check/eval/model-inventory-2026-11-16.md`.

Next on the list: classes and properties in a specification's applicability,
and offering the values a model already uses for a property.

*The tool is free, MIT licensed and provided as-is. Whether an IDS asks for the
right information is the call of the BIM manager or engineer responsible.*
