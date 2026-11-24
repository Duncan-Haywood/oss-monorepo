---
title: "Writing ifcXML that validates: what buildingSMART's own XSDs allow, and where they can't hold a model"
seo_title: "STEP to ifcXML that validates against the IFC4 XSD"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "IDS Model Check now writes IFC4 and IFC4X3 models as ifcXML laid out by buildingSMART's XSD. A wall with two openings can't be valid IFC4 ifcXML."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) has read ifcXML,
the XML form of IFC, for a while. This run added the other direction:

```
node cli.mjs --to-ifcxml model.ifc -o model.ifcxml
```

It takes an IFC4 or IFC4X3 STEP model (the `.ifc` file every BIM tool
exports) and writes it as ifcXML, for pipelines that query XML with XPath or
XSLT, for an XML database, or for a client whose contract asks for it. Free
alternatives exist, among them xBIM's toolkit and GeometryGymIFC, both .NET
libraries you write code against. This one is a single command with no
dependencies, in the same tool that checks the model against an IDS.

## The guess we started from

An earlier evaluation script already wrote ifcXML. It copied the shape of
real files: GeometryGymIFC's output and buildingSMART's own IFC4 examples.
The spatial tree hangs from the IfcProject, property sets nest under the
objects they describe, and every entity is written in full once and by
reference after that. Our reader read those files back without a single
difference across 857,301 entities.

Then we ran its output through `xmllint` against buildingSMART's IFC4 ADD2
XSD. The 50-entity sample model failed on the first element below the
project.

## What the XSD fixes

The XSD settles three things a reader can be relaxed about but a writer has
to get right:

- **Element order.** Child elements follow the class hierarchy, supertype
  first. On an IfcProject, IfcObjectDefinition's `IsDecomposedBy` comes
  before IfcContext's own `UnitsInContext`. We read every class in the XSD
  and checked this rule against it. There were no exceptions.
- **Which relationships may nest, and how.** The IFC4 XSD exposes 23 inverse
  attributes in 15 classes. Some hold a list (`<IsDefinedBy>` around
  property relationships). Others are the relationship itself:
  `<HasOpenings GlobalId="...">` is an IfcRelVoidsElement. Every other
  relationship stays at the top level with its pointers.
- **Which pointers are left out.** An IfcRelAggregates in the XSD has no
  `RelatingObject` element, because it is the element it sits under. A
  property relationship has no `RelatedObjects`, so it has to appear under
  every object it describes: in full under the first, by reference under
  the rest.

The writer no longer guesses. A short script reads all of this from the XSD
into a table of names (`schema/ifcxml-layout-ifc4.json`), and the writer
follows the table.

## Where the standard can't hold a model

IFC4's XSD allows **one** `HasOpenings` per element (`maxOccurs="1"`).
EXPRESS, the schema the XSD is generated from, says an element has a *set*
of openings. And because the XSD drops the relationship's pointer back to
the wall, a wall with two windows has no valid place for its second
opening. The TC1 XSD has the same limit. IFC4X3's XSD lifts it.

When that happens, the writer keeps the second opening's pointer to its wall.
The file then reads back complete but breaks the XSD at that element, and the
command says how many times and exits 1. We chose to keep the data over
passing the validator. Across the five public exports we tried, 680
relationships kept a pointer. 527 were openings in walls and slabs that
already had one. The other 153 were shape aspects of an IfcRepresentationMap,
which the IFC4 XSD gives no inverse to hold them.

## What else the check found

Running buildingSMART's 41 IFC4 Annex E STEP examples through the writer and
the XSD turned up four writer faults, all fixed:

- **Lists of lists.** These are written flat (`cType="list list"`). Only
  `InnerCoordIndices` keeps a wrapper per row. We were wrapping every row,
  which broke B-spline surfaces and structural load locations. The writer
  now records the shape in `ifc:arraySize`, and our reader cuts the list
  back into rows from it.
- **Binary values.** STEP writes them with a leading digit that counts
  unused bits. `xs:hexBinary` has no such digit.
- **Simple values in elements.** A texture's `RasterCode` is the element's
  own text, not a wrapped value.
- **Dangling references.** One example points at an entity the file doesn't
  contain. The writer had produced an element naming an abstract class; it
  now leaves the reference out and counts it.

The remaining XSD errors in the examples come from the example files
themselves: a required texture `Maps` written `$`, and a face index written
nested where IFC4 ADD2 TC1 has it flat.

The read-back also found a fault in our own reader. buildingSMART's IFC4X3
ADD2 XSD names its namespace `.../IFC/RELEASE/IFC4/3/ADD2`, with a slash.
Our reader only knew `IFC4X3` and `IFC4_3`, so it opened an IFC4X3 file
written in the official namespace as IFC4. On the Viadotto Acerno bridge
model, 127 of 540 checks came out differently until the fix.

Finally, IFC4X3 ADD2's XSD **does not compile** as published. `xmllint`
rejects `maxOccurs="?"` in three places, two list types built on complex
types, and restriction types with `-temp` names. So IFC4X3 exports follow
that XSD's layout but are checked only by reading them back.

## How it was checked

- **Read-back.** The writer ran on the sample, the 41 Annex E examples and
  five public exports: ARCHICAD, Revit and a 33 MB IFC4X3 bridge, 901,550
  entities. Every entity's arguments, read back from the XML, equal the STEP
  reader's, apart from the source-file faults above.
- **IDS verdicts.** The checker's 540 verdicts from 68 IDS files are the
  same on each export as on its STEP file: 3,240 of 3,240.
- **XSD validation.** `xmllint` accepts 37 of the 42 small files. The four
  large IFC4 exports produce 1,817 XSD errors, and each one is accounted
  for: 680 are the kept pointers, and 1,137 are required attributes the
  exporter left unset (`$`), mostly 940 IfcCurveBoundedPlanes in one Revit
  file with no `InnerBoundaries`. The checker's `--conformance` pass flags
  those same attributes in the STEP files, so the ifcXML is faithful to its
  source, faults included.

The numbers and commands are in
`ventures/ids-model-check/eval/ifcxml-export-2026-11-24.md`.

Next on the list: a "Download as .ifcxml" button on the page, and a second,
independent reader opening the output: xBIM or GeometryGymIFC.
