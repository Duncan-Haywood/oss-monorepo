---
title: "Revit writes Reference as a label, and an IDS check asking for an identifier fails every object"
seo_title: "IDS dataType mismatch: why Revit exports fail Reference checks"
date: 2026-11-17
description: "On two real Revit exports, 791 of 966 objects failed IDS checks only because of a data type. The free IDS editor now offers to drop the dataType."
tags: [ids-model-check, bim, ifc, ids]
---

An IDS file is a list of things an IFC model must contain: every wall has a
`Pset_WallCommon.Reference`, every stair has `NumberOfRiser`. Each property
requirement can also name a data type. The [IDS editor](/ids-model-check/editor.html)
fills it in from buildingSMART's property set templates. For `Reference` in
IFC2X3, the template says `IFCIDENTIFIER`.

Revit-era exports write it as `IFCLABEL`.

We had already counted how often a real export disagrees with the template.
On four public exports from opensourceBIM's IFC files (the HHS office's
architect, construction and MEP models and the Schultz Residence), 21 of 122
standard properties use another type. Fourteen of the 21 are `Reference` as a
label. Four are stair counts written as `IFCINTEGER` instead of
`IFCCOUNTMEASURE`. One is a railing height written as a bare `IFCREAL`. Until
now the editor pointed this out on the row ("a check with this dataType will
fail them") and offered no fix.

## What it costs

Today we wrote one specification for each of those 21 properties, exactly as
the editor writes it, and ran each against the model it came from:

- **0 of 21 specifications pass. 966 of 966 applicable objects fail.**
- Without the data type, 14 of 21 pass, and 175 objects fail.

So 791 objects failed on a technicality. The 175 that still fail are real
gaps: 84 building-element proxies with no `Pset_BuildingElementProxyCommon`
at all, 42 coverings without `Finish`, 33 spaces whose `Reference` is empty,
and 16 failures on stairs and slabs missing the set. Those are the
findings a coordinator wants. The other 791 are noise that hides them.

The obvious fix, writing the model's type (`IFCLABEL`), is worse. It
contradicts the standard template, so the editor's audit flags it as an
error, and so does buildingSMART's own IDS-Audit-tool.

## Accept any data type

A property facet with no `dataType` checks the property whatever type it
holds. If it asks only that the property be present, the audit has nothing to
warn about. So rows like these now carry an **Accept any data type** button.
It removes the dataType and keeps a text value if the row had one. The
neighbouring **Write dataType IFCIDENTIFIER** button puts it back. That
round trip works for all 21 rows.

We ran every file through IfcTester 0.8.0 as well. It gave the same verdict
as this checker on every specification in each variant (21, 21 and 19): the template's
type, no type, and no type with the model's own values as a one-of list.

## The one that disagreed

The first run did not agree. One property, `Pset_StairFlightCommon.NosingLength`,
is written as `IFCPOSITIVELENGTHMEASURE(29.99999999999999)` in a model
measured in millimetres. The editor offers values in SI units, so it offered
`0.03`. With no data type, this checker converted the unit and passed 8 of 8
stair flights. IfcTester compared the raw number and failed all 8.

Neither tool is clearly wrong, because IDS 1.0 expects a data type whenever a
value is given, and the editor's audit already warns about a value without
one. So the editor no longer offers that combination. On a model type that
is a real number, dropping the data type keeps only the presence check, and an
opened row that already asks for a value gets a warning. Integers and labels
compared the same way in both tools.

The full tables, the commands and the IfcTester versions that install here
are in the project's
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/model-any-type-2026-11-17.md).
The editor runs in the browser, and models and IDS files stay on your
machine.

*This is a free, open-source tool (MIT). Its checks are an aid, not a
certification: confirm requirements with your project's information manager
and the standard itself.*
