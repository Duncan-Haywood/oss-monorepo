---
title: "When an IFC file breaks its own schema, an IDS check reads straight past it"
seo_title: "IFC schema faults an IDS check reads past, and a free check"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "A bare 0.2 where IFC needs a typed value, a record one attribute short, IFC4X3 enum values in an IFC4 file: the IDS checker now names each one."
---

An IDS check asks questions about a building model: does every wall carry a
fire rating, is every beam's `PredefinedType` one of these values. To answer,
the checker reads each value by its position in the record and by its type.
That only works if the file follows the IFC schema it says it uses. When the
file doesn't, the check can test the wrong value or skip it, and nothing
tells you.

[IDS Model Check](https://marisstella.app/ids-model-check/) now reads every
record of a STEP `.ifc` file against its schema and lists each fault, grouped
by kind. Here is the kind of thing it finds:

```
#1=IFCPROPERTYSINGLEVALUE('InstallationDate',$,0.2,$);
```

`NominalValue` is a select. IFC needs the value wrapped in its type, such as
`IFCREAL(0.2)` or `IFCVOLUMEMEASURE(0.2)`, so a reader can tell what kind of
number it is. A bare `0.2` leaves that unknown, so an IDS property facet that
asks for a measure type is answering a guess.

## A labelled set of broken files

IfcOpenShell, the open-source IFC library, ships a folder of small test files
for its validator, `test/fixtures/validate`. Each `fail-*` file has one known
fault and each `pass-*` file has none. Before this change, our reader noticed
the fault in 1 of the 25 broken files: the one whose class does not exist in
its schema. Now it flags all 25, each with the right fault, and says nothing
about the 13 good ones. The faults include:

- an `IFCPERSON` with 7 or 9 attributes, where IFC4 gives it 8;
- `*` (derived) written in `IfcSIUnit.Prefix`, which is not derived;
- `IFCREAL()` with nothing inside, and `IFCNONEXISTANTTYPE(0.1)`;
- `IFCLABEL(0.5)` (a number where a label needs a string) and
  `IFCPOSITIVELENGTHMEASURE('1')` (a string where a number belongs);
- `IFCAREAMEASURE(5.4)` where `AreaValue` takes a bare number;
- `nan.` in a coordinate, which means the record cannot be read at all;
- two `IfcApplication`s sharing an identifier, which IFC requires to be unique;
- an IFC2X3 `IfcGroup` assigned by zero relationships, and another by two (IFC2X3
  needs exactly one);
- a `FILE_NAME` header with 6 or 8 fields where ISO 10303-21 gives it 7.

## The same verdicts as IfcOpenShell, on 492 public files

Then I ran IfcOpenShell's own validator, `ifcopenshell.validate` 0.9.0, beside
the new check on 492 public IFC files. These were IfcOpenShell's own 293
files, buildingSMART's IFC 4.3 samples and Sample-Test-Files, the
opensourceBIM set, and web-ifc's test models. I set aside two kinds of line
that the checker already reports another way: duplicate GlobalIds and classes
the schema lacks. After that, on IfcOpenShell's 293 files the two tools flag
exactly the same files: 139 by both, 154 by neither, and none by one tool
alone. The buildingSMART and opensourceBIM files agree file for file too. The
full numbers, including web-ifc's, are in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/conformance-2026-11-24.md).

The tools differ in two places. IfcOpenShell also checks inverse
relationship counts, such as every shape representation belonging to exactly
one product. This check leaves those out, apart from IFC2X3's group rule.
IfcOpenShell also accepts `$` in a derived slot, where the file format says
`*`. This check reports it.

## What real files hold

The public files are not clean, and the faults are the kind that matter to
an IDS check:

- An IFC4 bridge model uses IFC4X3's enumeration values: 28 plates are
  `.BASE_PLATE.`, 10 walls `.RETAININGWALL.`, 8 beams `.EDGEBEAM.`. IFC4 lists
  none of these. An IDS facet on `PredefinedType` reads them as written, so
  the IDS check can pass on values the schema does not allow.
- A Bonsai classification library writes `$$` with no comma between them in
  1,010 classification references, so not one of those records can be read.
- IfcOpenShell's own IFC4 property set template file has three templates one
  attribute short, so every value after the gap sits one place off.
- Bonsai's IFC2X3 demo library names a cartesian point as the application in
  four owner histories.
- An architectural model (`FM_ARC_DigitalHub.ifc`) writes `$` in 940 places where IFC4 needs an empty list.

## Where to see it

On the page, any STEP model up to 40 MB now gets a MODEL block beside the
duplicate GlobalIds, listing each kind of fault, how often it occurs and the
first record. The IDS verdict does not change, because the IDS asks what it
asks. But you can now see when that verdict rests on a broken file. On the
command line, `node cli.mjs --conformance model.ifc` lists every fault and
exits 1 if it finds any, so a CI job can stop on a bad export before it runs
any IDS at all.

The checks are typed, so most fixes are an export setting or a newer
exporter. The tool is free, runs in your browser and uploads nothing.
