---
title: "A 374 MB ifcXML file, checked under a 1 GB heap, and a space that changed a verdict"
seo_title: "Checking a 374 MB ifcXML model under a 1 GB heap"
date: 2026-11-18
tags: [bim, ifc, ifcxml, performance]
description: "The IDS checker's ifcXML reader now streams and reads geometry on demand: peak memory 4.0 GB to 1.5 GB on a 374 MB model, with every report unchanged."
---

The [IDS model checker](../../ventures/ids-model-check/README.md) reads IFC
models in three forms: STEP `.ifc`, ifcXML and `.ifczip`. Its STEP reader
has been lazy for a day. It scans the file once, notes where each entity's
record starts, and reads a record's arguments only when a check asks for
them. The ifcXML reader was not lazy. It built the whole XML tree, turned
every element into an entity and kept all of it.

## There was no large file to test on

The largest public ifcXML file we found is 604 KB, one of buildingSMART's
IFC4 examples. GitHub's code search has nothing bigger, and real projects
exchange STEP. So the eval converts real STEP exports to ifcXML in xBIM's
IFC2X3 layout (`eval/step-to-ifcxml.mjs`), then reads the result back and
compares every entity with the STEP reading.

That comparison found a fault before any speed work began. On the HHS
Office MEP export, 731 of 665,224 entities came back different. Each was a
label like `' 277 V/1-64 VA'` with a leading space. The reader trimmed every
text value before reading it, so the same property read with the space from
STEP and without it from ifcXML. An IDS value or pattern on that label could
pass on one form of the model and fail on the other. `xs:string` keeps
whitespace, so the reader now keeps strings as written. After the fix, all
2,340,831 entities of seven real exports read the same both ways. The 43
STEP/ifcXML twin pairs from earlier work give the same output before and
after.

## What changed

- **Stream.** The XML reader now calls back as each element closes. The
  ifcXML reader handles a top-level entity when its element closes and
  then drops it, so the whole tree never exists at once.
- **Geometry on demand.** Points, loops, faces and the other representation
  items keep only where their element starts and ends in the text, and are
  read again when a check needs them. The STEP reader treats them the same
  way.
- **A shallow copy for attribute tests.** A specification that applies to
  every entity tests attributes on every point. That test only needs to know
  whether a list is empty and whether a value is a reference, so each
  geometry entity keeps that much, and identical rows are shared. Without
  it, re-reading every point's XML made the 68-IDS run twice as slow.

## Numbers

68 IDS files (3 starter, 65 public), `maxFailed: 1000`. The comparison
reader is main with only the whitespace fix applied, so the report hashes
test the streaming alone:

| ifcXML model | before | after | reports |
|---|---|---|---|
| HHS MEP, 152 MB | 10.3 s, 1,680 MB peak | 8.7 s, 681 MB | identical |
| Schultz Residence, 93 MB | 5.5 s, 1,054 MB | 5.5 s, 419 MB | identical |
| four exports federated, 374 MB | 36.2 s, 4.0 GB | 29.7 s, 1.5 GB | identical |
| the same, 1 GB heap | out of memory | 30.1 s | |

The same federated model as STEP is 96 MB and takes 14.3 s, so ifcXML is
still about twice as slow. The time goes to the XML tokenizer and the
garbage collector. There is also a hard ceiling. A JavaScript string holds
about 512 million characters, so an ifcXML file much past 500 MB cannot be
read at all. A team that has a model that large should exchange it as STEP.

The full method and every measurement are in
[`eval/lazy-ifcxml-2026-11-18.md`](../../ventures/ids-model-check/eval/lazy-ifcxml-2026-11-18.md).
