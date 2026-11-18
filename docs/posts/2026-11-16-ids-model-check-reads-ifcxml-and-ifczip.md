---
title: "The IDS checker now reads ifcXML and .ifczip, checked against a Revit model in both forms"
seo_title: "Check ifcXML and ifcZIP models against an IDS in the browser"
date: 2026-11-16
tags: [bim, ifc, ids, ifcxml, construction, javascript]
description: "IDS Model Check now reads ifcXML and zipped IFC. xBIM's ifcXML export of a Revit model matched its STEP file on 2,205 of 2,205 attribute values."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks a building
model against a buildingSMART Information Delivery Specification in a browser
tab, with nothing uploaded. Until today it only read STEP `.ifc` files. IFC
comes in two other forms that people actually get sent: **ifcXML**, the same
model written as XML, and **ifcZIP**, an `.ifc` or ifcXML file zipped. Both
now work, on the page and on the command line
(`node cli.mjs model.ifczip spec.ids`).

## Two layouts, one model

ifcXML has no attribute order, and STEP is all order, so the reader goes
through the IFC schema to put each value in the slot a STEP file would use.
After that the checker runs on it unchanged. There are two layouts in real files:

- **IFC2X3 ifcXML** writes each attribute as a child element
  (`<Name>Basic Wall</Name>`), every entity at the top level, references as
  `<IfcOwnerHistory ref="i2" xsi:nil="true"/>`.
- **IFC4 ifcXML** takes shortcuts. Simple attributes become XML attributes
  (`PredefinedType="solidwall"`), and entities sit inside whatever uses them.
  An attribute element can be the value itself (`<RelatingObject
  xsi:type="IfcProject" ref="p1"/>`, or with no type at all, an instance of the
  attribute's own class). Relationships can sit under an *inverse* attribute
  (`<IsDefinedBy>` inside a wall) without their own pointer back to that wall.

That last shortcut needed something the checker's schema tables didn't have:
for each inverse attribute, the relationship class and the attribute it
points back through ("`IsDefinedBy`: `IfcRelDefinesByProperties` for
`RelatedObjects`"). The schema generator now pulls that out of the EXPRESS
files. All 153 IFC4 inverses resolve, and the existing tables come out byte
for byte as before.

## How it was checked

The test that counts is the same model in both forms. xBIM's test files include
a Revit 2014 export, `4walls1floorSite`, as a STEP file and as xBIM's ifcXML
export of it. Both read to 579 entities. After mapping references, **2,205 of
2,205 attribute values are identical**, and the starter IDS gives the same
verdicts on both.

No public IFC4 ifcXML with a STEP twin turned up, so I wrote one: the checker's
sample house as IFC4 ifcXML, by hand, using every shortcut above. It matches
the STEP sample on 319 of 319 values, and both starter IDS files give the same
verdicts.

Across all 16 xBIM ifcXML and ifcZIP test files (9 distinct ifcXML documents
from about seven exporters, plus 7 zips) the reader reported one problem. The
file really has it: a `ref` to an id it never defines. Every zip entry was
byte-identical to Info-ZIP's `unzip -p`. One zip, written the way .NET writes
them, stores its sizes as `0xFFFFFFFF` with the real values in a zip64 extra
field. The first version of the zip reader refused it, and the fix went in
before this post. buildingSMART's 334 IDS test pairs still score 334 of 334.
In Chromium the page unzips with the browser's own `DecompressionStream`.

## What is not shown

No real IFC4X3 ifcXML has been through it. The reader recognises the namespace,
but I didn't find a file to test on. And nine documents isn't every exporter:
if one of yours reads wrong, the page's feedback link is the place to say so.

Source, tests and the measurement:
[`ventures/ids-model-check`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check)
(`ifcxml.mjs`, `zip.mjs`, `eval/ifcxml-xbim-2026-11-16.md`). MIT licensed.
