---
title: "A typo in the IFC4 schema: why two coordinate systems never disagree in IFC2X3 and IFC4"
seo_title: "IFC4 IfcSameAxis2Placement compares an origin with itself"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "Seeding 1,283 faults into 102 public IFC models showed that IFC2X3 and IFC4's WCS rule can't see a moved origin. The free checker now flags it."
---

The free [IDS model checker](https://marisstella.app/ids-model-check/) runs
the IFC schema's own WHERE rules on every model you give it. Earlier today we
tested those rules by writing faults into real models on purpose and checking
that each rule fires on the record we broke and nowhere else.
[That post](2026-11-24-ids-model-check-seeded-faults.md) covered eight
fault families an IDS check leans on. This run added seven more: the schema's
two *global* rules, and a few that an IDS check reads less directly.

## What we seeded

Each family writes one kind of fault into a copy of a real model:

- **A second `IfcProject`.** The global rule `IfcSingleProjectInstance`
  allows one.
- **A second representation context with its axes turned a quarter turn.**
  The global rule `IfcRepresentationContextSameWCS` says every context shares
  one world coordinate system.
- **The same with the origin moved 1000 units instead.**
- **An SI unit named for another dimension**, such as a length unit called
  `SQUARE_METRE`. That breaks `IfcNamedUnit.WR1`.
- **An aggregation that lists its own whole among its parts.** That breaks
  `IfcRelAggregates.NoSelfReference`.
- **A material on a space, a storey or the project, and a material on an
  opening.** Those break `IfcRelAssociatesMaterial.AllowedElements` and
  `NoVoidElement`.

We ran these on 102 public files: web-ifc's test models (ARCHICAD, Revit,
Tekla, BlenderBIM and others) and both buildingSMART sample sets, in IFC2X3,
IFC4 and IFC4X3. With the first eight families that made **1,283 seeds.
Every one fired on the record it was written into, under the rule it was
aimed at. No other failure appeared, and none of the original's went away.**
IfcOpenShell's validator gave the same answer on all 542 new seeded copies
it can open.

## The one that didn't fire, and why that's right

The moved origin fired in all 57 IFC4X3 files and in none of the 45 IFC2X3
and IFC4 files. Our interpreter is right both times, because it reads the
rule as written. `IfcRepresentationContextSameWCS` compares each context's
placement with the first one's through the function `IfcSameAxis2Placement`.
In IFC2X3 and IFC4 that function ends:

```
IfcSameCartesianPoint(ap1.Location, ap1.Location, Epsilon)
```

The first placement's origin is compared with itself, so it always matches.
IFC4X3 changed it to `ap2.Location`. The turned axes failed in every schema,
because the direction checks were never affected.

So in an IFC2X3 or IFC4 model, a plan context or a survey context whose
origin sits somewhere else passes the schema rule. Its geometry is then
offset from everything else in the model, and no schema check says so.

## What the checker does now

When a model's schema has the IFC2X3 or IFC4 version of the function, the
conformance pass runs the rule a second time with IFC4X3's comparison. If
only that run fails, the model gets a `context-origin` note. The note says
the contexts don't share one origin and explains why the schema's own rule
can't see it. None of the 102 public originals gets the note, and every
seeded copy with a moved origin does. Like the rest of the conformance block,
it is a warning: the IDS verdict doesn't change.

Two other seeds broke a second rule when we first ran them. In both cases the
second rule was correct, so we changed the seed, not the checker:

- **A site that lists itself among its parts decomposes twice.**
  `IfcSpatialStructureElement.WR41` allows exactly one decomposition. A seed
  on a spatial element now expects both failures.
- **A 3D placement with a new x direction but no explicit z direction.**
  `AxisAndRefDirProvision` needs both directions or neither, so the seed now
  writes both.

The full tables, the harness and the commands to reproduce them are in
`ventures/ids-model-check/eval/where-rules-global-seeds-2026-11-24.md`.

*The checker is free and MIT-licensed, and it runs in your browser. Its
results are checks against published schemas, not professional advice about
your model.*
