---
title: "An IFC4 file read as IFC2X3 because ARCHICAD named its \"IFC2x3 add-on\""
seo_title: "IFC4 ifcXML misread as IFC2X3: a schema sniffing bug"
date: 2026-11-18
tags: [bim, ifc, ifcxml, performance]
description: "Timing the IDS checker on nested IFC4 ifcXML found a schema sniff that read ARCHICAD's IFC4 export as IFC2X3 and changed 19 of 539 verdicts without an error."
---

The [IDS model checker](../../ventures/ids-model-check/README.md) reads IFC
models as STEP `.ifc`, ifcXML or `.ifczip`. Earlier today its ifcXML reader
was taught to stream: it reads each top-level element as it closes and then
drops it, so it never holds the whole XML tree. That was measured on one
writer's layout, xBIM's IFC2X3, where every entity sits at the top level.

IFC4 writers don't work that way. In GeometryGymIFC's output and
buildingSMART's own IFC4 examples, one element holds 97% to 99.9% of the
file: the IfcProject, with its sites, storeys, walls, property sets and
geometry nested inside it. A reader that frees memory only when a
top-level element closes holds nearly all of that.

## Making the files

Nobody publishes large ifcXML files, as far as we can find. So the eval now
has a writer for the nested layout, copied from those examples:
`eval/ifc4-layout.mjs`. It writes simple attributes as XML attributes, writes
each entity in full where it is first used and as `href="i42"` after that,
and puts each relationship under the object it belongs to. We ran it on four
real exports from the web-ifc project's test folder: three IFC4 buildings
and an IFC4X3 viaduct, 10 to 32 MB as STEP. Read back, every entity equals
the STEP reading (857,301 of 857,301). We then checked each model in both
forms against 68 IDS files. Per specification, the status and the
applicable, passed and failed counts matched on all 2,160.

## The file that lost two thirds of itself

The six-copy federated model read back 447,528 entities instead of
1,207,966. Nothing in the report said so.

The reader worked out the IFC version by searching the first 4,000
characters for "IFC2X3", before it looked for "IFC4". One of the three
buildings came from ARCHICAD 20, whose IFC4 export writes
`ApplicationIdentifier="IFC2x3 add-on version: 4009 GER FULL"` in its owner
history. In the nested layout the owner history sits near the top of the
file, so the IFC4 model was read with the IFC2X3 schema. On that one
building, 19 of 539 verdicts came out different from its STEP file, and no
error was shown.

The version now comes from the root element's namespace and schema
location, the place the file declares it. The rest of the header is read
only when the root names no version. Of the 59 ifcXML files we have, only
the two ARCHICAD-written ones change, both to IFC4.

## The memory

Geometry nested inside a larger element is now cut down to its position in
the file as it closes. When the reader's walk reaches it, it parses that span
again. The walk runs in the same order as before, so every entity keeps its
number and every report is byte-identical. On the 166 MB federated file,
peak memory went from 1,770 MB to 1,481 MB. The check now fits a 768 MB
heap, where before it ran out of memory. Parsing takes about 20% longer,
because nested geometry is parsed twice.

Property sets and relationships under the root are still held until the root
closes, and the same model as STEP still peaks lower (1,032 MB). Cutting
those too would mean numbering entities in a different order. That would
change the `#N` numbers the reports print, so it is left for a run that can
show the trade is worth it.

Everything above is in
[`eval/ifc4-layout-scale-2026-11-18.md`](../../ventures/ids-model-check/eval/ifc4-layout-scale-2026-11-18.md),
with the commands to rerun it.
