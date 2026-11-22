---
title: "ifcXML, ifcJSON and IFC5 to a .ifc file: 78,343 entities written out and read back"
seo_title: "Convert ifcXML, ifcJSON and IFC5 to a STEP .ifc file"
date: 2026-11-22
tags: [ids-model-check, ventures]
description: "The free IDS checker now writes any model it reads as a STEP .ifc and fills ifcXML models too. On 187 public files every entity read back the same."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) has read ifcXML,
ifcJSON and IFC5 models for a while. Until today it could check them but not
hand them back: the fill panel, which writes the property values a failing
IDS check asks for into a copy of the model, refused anything that wasn't a
STEP `.ifc`, because it edits the STEP text line by line. Most BIM tools only
open `.ifc` anyway, so a model that arrived as XML or JSON got stuck.

Now the checker writes any model it reads as a STEP file (`step-writer.mjs`),
and the fill writes the model as STEP first, then fills that copy. On the page
a non-STEP model gets a *Download as .ifc* button. On the command line it's
`node cli.mjs --to-step model.ifcxml -o model.ifc`. It runs in the browser and
nothing is uploaded.

## What makes it more than a print loop

The XML and JSON forms leave out things STEP needs. They don't tell `1` from
`1.`, but STEP does, and a reader can reject a REAL written as an INTEGER. So
every number takes its type from the IFC schema: the attribute's declared type,
or the typed value's. Binary values (texture pixels) are whole bytes in
xs:hexBinary, while STEP's form starts with a count of unused bits. One
ifcJSON writer wraps each triangle index as `{"type": "IfcPositiveInteger",
"value": 28}`, so those get unwrapped. And when a source leaves out an
attribute the schema requires, the writer puts STEP's "unset" (`$`) there and
lists it, rather than guessing a value.

## How it was checked

All public inputs, fetched by pinned scripts: buildingSMART's 43 IFC4 Annex E
and GeometryGym ifcXML examples, the 97 ifcJSON samples in buildingSMART's
ifcJSON repository, and the 47 IFC5 alpha examples, checked against 65 public
IDS files. The full write-up is in
[`eval/to-step-2026-11-22.md`](../../ventures/ids-model-check/eval/to-step-2026-11-22.md).

- **Read back:** 78,343 of 78,343 entities come back from the written file
  with the same class and every argument the same. The IDS results agree in
  12,716 of 12,716 checks (status, applicable count and failing GlobalIds).
- **A second reader:** IfcOpenShell 0.9 opens all 187 written files, and 149
  pass its schema validation with nothing to report. For each remaining issue
  that the exporter's own STEP twin doesn't have, we traced the cause back to
  the source file. In the biggest case, an ifcJSON converter drops
  `IfcFaceOuterBound.Orientation` on 163 faces of one model.
- **Fill:** filling the 43 ifcXML models against the 65 IDS files writes the
  same 351 values, GlobalId for GlobalId, as filling their STEP twins (2,795 of
  2,795 fills).

The comparison also turned up one bug in the reader, now fixed. One ifcJSON
writer stores a site's latitude as `{degrees, minutes, seconds,
microSeconds}`, and the reader kept only the degrees: 49 where the STEP twin
says 49° 5′ 44″.

## Limits

The written file keeps the source's own entities. The extra unreferenced
entities a STEP export sometimes carries aren't recreated, and whatever a
converter dropped stays dropped. The header names this tool as the writer. So
far IfcOpenShell is the only second reader we've run. No authoring tool
(Revit, ARCHICAD) has opened a written file yet, and that test is still to
come.
