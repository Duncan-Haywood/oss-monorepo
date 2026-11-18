---
title: "Reading nested ifcXML from the inside out without renumbering the model"
seo_title: "Streaming nested IFC4 ifcXML with stable entity numbers"
date: 2026-11-18
tags: [bim, ifc, ifcxml, performance]
description: "The IDS checker now reads each nested ifcXML element as it closes, and replays a trace so every entity keeps the number reports already print."
---

The [IDS model checker](../../ventures/ids-model-check/README.md) streams
ifcXML. Each top-level element is read as it closes and then dropped. IFC4
writers, though, nest a whole building under one element. The IfcProject
holds its storeys, the storeys hold their walls, and each wall holds its
property sets. Earlier today the reader learned to cut nested geometry down
as it went. Property sets and relationships stayed whole in memory until
the project closed.

## Why it waited

Reports print entity numbers (`#5 IfcWall`). The reader numbers entities
parent first, in document order: the project is #1 and its first
relationship #2. Reading an element when it closes runs the other way: a
property value closes before its property set, the wall and the project.
Number entities as they close and every number in every report changes.
Teams that compare one report with the next would see churn that means
nothing.

## Read now, number later

So the reader now does both. When a nested element closes, it is read into
its record straight away. It gets a provisional number (-2, -3, ...), and
the reader keeps a short trace: the record, then the ids it met and the
entities it holds, in order. The element itself is swapped for a small
stand-in. When the project closes, the walk runs from the top as before. At
each stand-in it replays the trace: final numbers in the old order, the
same notes in the same order, and a second element with a repeated id
skipped as before. References held under a provisional number are then
rewritten to the final one.

We checked it against main's reader on 57 ifcXML files:

- the public twins and xBIM's samples;
- four real exports from the web-ifc test folder, written in the nested
  layout.

All 864,346 entities have the same number, arguments and position, and
every note matches. On five models, reports from 68 IDS files hash the same.

## What it bought, and what it didn't

The figure we tracked is the smallest Node heap that can parse the model,
because that decides whether it opens on a laptop or a CI runner:

| model | before | after |
|---|---|---|
| C20-Institute-Var-2 (19 MB ifcXML) | 160 MB | 96 MB |
| kleine_Wohnung (28 MB) | 144 MB | 128 MB |
| Viadotto Acerno (39 MB, IFC4X3) | 128 MB | 112 MB |
| FM_ARC_DigitalHub (35 MB) | 160 MB | 160 MB |
| six projects federated (166 MB) | 704 MB | 704 MB |

The federated file did not move. Each of its six projects is a separate
top-level element, so the tree under any one was already small next to the
records kept for all six. Its peak is the records, so the next saving there
is a smaller record per entity.

The first version was worse than main. It needed 256 MB on FM_ARC_DigitalHub
because each emptied XML node still cost about 200 bytes. A compact
stand-in, a typed array for the number map, and freeing the trace as it
replays brought it back to 160 MB. The full write-up, with planted-fault
checks, is in
[`eval/nested-early-2026-11-18.md`](../../ventures/ids-model-check/eval/nested-early-2026-11-18.md).
