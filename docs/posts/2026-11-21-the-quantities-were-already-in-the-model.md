---
title: "The quantities an IDS asks for were already in the model, under another name"
seo_title: "Filling Qto_ quantities from IFC2X3 BaseQuantities"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "Our IDS checker now writes quantities and unset attributes into a copy of the IFC. On two real exports, 1,726 quantities came from their own BaseQuantities."
---

This morning the free [IDS checker](https://marisstella.app/ids-model-check/)
learned to write the property values an IDS asks for straight into a copy of
the `.ifc` ([the earlier post's notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/model-fill-2026-11-21.md)).
Two kinds of requirement were still only counted: quantities (`Qto_` sets) and
attributes (`Description`, `ObjectType`, `Tag`, an unset `PredefinedType`).
Now it writes both.

## Quantities are a different kind of record

In IFC a quantity is not a property. It is an `IfcQuantityArea` or
`IfcQuantityLength` inside an `IfcElementQuantity`. IfcTester reads one set
per name, so if you put a quantity into a property set, or put a property set
next to a quantity set of the same name, one of the two disappears from view.
The fill now chooses the record from the facet's data type, so `IFCAREAMEASURE`
becomes an area. When the facet has no data type, it uses the standard
template's. It writes into the element's own quantity set, or adds a new one.
Some IDS files ask for a data type that no quantity can hold, such as
`IFCPOSITIVELENGTHMEASURE`. Those requests are refused, and the table says why.

## The surprise: the numbers were already there

Many published IDS files are written for IFC4 and ask for, say,
`Qto_DoorBaseQuantities.Width`. Many real models are IFC2X3 exports, and
those keep the same quantities in a set called plain `BaseQuantities`. The
check fails, but the number is in the file. So when an element has a quantity
of the same name and kind in another quantity set, and those sets agree, the
fill copies it digit for digit. It never computes one.

Against 68 public IDS files, the two HHS Office models from
`opensourceBIM/IFC-files` gained 1,726 quantities this way: door heights and
widths, slab widths, column surface areas, space floor areas and heights. The
values written without any person typing grew from 1,344 to 3,090. The two
Revit exports gained none, because their quantity sets don't use those names.
That is the next gap.

The first version rounded copied values to 12 digits, so a column's
3440025.053859637 mm² came out as 3440025.05386. We caught it by comparing
every copied value with the original file's text. It is fixed, and all 3,452
copies in the saved files now match exactly.

## Attributes: fill the blanks, never overwrite

An attribute the element leaves unset (`$` or an empty string) is written into
its own record. You can type one into the to-fill table, where its set column
reads `(attribute)`. Enumerations must use one of the type's own values:
`partitioning` becomes `.PARTITIONING.`, and `BANANA` is refused with the list.
An attribute that already holds a value is never overwritten, even when the IDS
disagrees with it. Changing it is a modelling decision, not a gap to fill.

## How it was checked

On four real exports, IfcTester 0.9.0 checked 57,680 written values: 50,111
properties, 7,271 quantities and 298 attributes. Every one failed before and
passes after, and no element that passed before fails now. In every filled
file, the lines that changed are exactly the records the fill says it edited
or added. The full numbers and the commands to rerun them are in
[the evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/model-fill-attributes-quantities-2026-11-21.md).

While measuring, we also found a bug in our own sweep. Its stand-in for a
person typing values gave `null` for any number with no allowed range. So the
first note's table-mode figures undercount numeric writes. That note's
property results still hold.

Results are a check against what the IDS file says, not an engineering or
compliance opinion: verify the filled model in your own tools before you
hand it on.
