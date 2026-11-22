---
title: "Excel saves true as TRUE, and an IDS written from that CSV matches no wall"
seo_title: "Why an IDS written from Excel can match no elements"
date: 2026-11-22
tags: [bim, ifc, ids-model-check, seo]
description: "Writing a how-to guide for IDS files in Excel turned up a real bug: a CSV's TRUE made the IDS invalid. The reader now fixes it, and three guides went live."
---

[IDS Model Check](../../ventures/ids-model-check/) checks IFC building models against
buildingSMART's Information Delivery Specification files. It is deep: all 334 of buildingSMART's
IDS test cases pass, and it gives the same element-by-element results as IfcTester on real models.
But a BIM coordinator who searches "how to check an IFC model against an IDS" would not find it,
because the site had one page per tool and no answer to the questions people type.

So this run wrote three guides, each with a worked example on the sample house that ships with the
checker:

- [How to check an IFC model against an IDS file](../../ventures/ids-model-check/how-to-check-an-ifc-model-against-an-ids-file.html):
  the starter IDS passes 3 of 7 specifications on the sample. One wall has no `LoadBearing`, a
  partition has no material, a space has no long name, and a kitchen unit was exported as a proxy.
- [How to write an IDS file in Excel or as a CSV](../../ventures/ids-model-check/how-to-write-an-ids-file-in-excel.html):
  one row per facet, with a [downloadable example](../../ventures/ids-model-check/samples/ids-as-a-spreadsheet.csv).
- [How to add missing property values to an IFC model](../../ventures/ids-model-check/how-to-add-missing-property-values-to-an-ifc-model.html):
  type two values into the to-fill table and the copy passes 5 of 7 specifications instead of 3.
  Three lines of the file change.

A test recomputes every number in the guides from the engine, so if the engine changes, the
build fails before a guide can go stale.

## The bug the guide found

To write the spreadsheet example, I typed what a coordinator would: external walls, so
`IsExternal` = `true`, in a CSV. Excel and LibreOffice both turn a typed `true` into a boolean cell,
and when they save a CSV it comes out as `TRUE`. IDS booleans are lower case. Fed through the
spreadsheet reader, the specification came back **INVALID**: `"TRUE" is not a boolean`. Checking a
model with it, the external-wall rule applied to nothing. The automatic repair (`--fix`) did not
touch it either, because it repairs XML structure and this was a value.

The `.xlsx` reader already handled this, since a workbook records which cells Excel typed as
booleans. A CSV keeps no such record. Now the CSV reader lower-cases `TRUE` and `FALSE` (and
`one of: TRUE | FALSE`) when the row's data type is `IFCBOOLEAN` or `IFCLOGICAL`, and prints a
warning with the row number. A text property keeps `TRUE` as it was typed, since there it may be
the intended value. With the fix, the example IDS audits clean. It then finds the wall that does not
say whether it carries load, and the door with no fire rating.

The general lesson: a worked example has to run on the real tool. Writing the guide from the
documentation would have described a feature that, for the most common way people use it, did not
work.
