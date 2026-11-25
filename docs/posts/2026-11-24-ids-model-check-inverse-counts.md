---
title: "Counting who points at what: inverse checks in a free IFC schema check"
seo_title: "IFC inverse cardinality checks, matched with IfcOpenShell"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "An opening that voids nothing, one pset on 169 types, a layer listed twice: the free IFC check now counts inverses and agrees with IfcOpenShell on 1,085 lines."
---

An IFC file is a list of records that point at each other. A wall points at
its placement, and an opening relationship points at the wall and at the
opening. Some of the schema's rules are about the pointers *coming in* rather
than the values a record holds. These are its INVERSE attributes. IFC4 says an
opening must void exactly one element:

```
VoidsElements : IfcRelVoidsElement FOR RelatedOpeningElement;
```

IFC2X3 says a placement places exactly one product, and a property set belongs
to at most one type. Nothing in the opening's own record breaks these rules.
You only see a break by counting, across the whole file, which records point
at it.

Earlier today, [IDS Model Check](https://marisstella.app/ids-model-check/)
gained a pass that reads every record of a STEP file against its schema. Set
beside `ifcopenshell.validate` on 492 public files, the two tools flagged the
same files. The one kind of line IfcOpenShell gave and this check did not was
inverse counts: 1,085 lines, 47 on IfcOpenShell's own test files and 1,038 on
web-ifc's.

## Now it counts them

The schema files the checker ships with now carry each inverse's bounds. There
are 48 bounded inverses in IFC2X3 and IFC4 and 52 in IFC4X3. The pass indexes
which records point at each record, then checks the count. On the same 492
files it now matches IfcOpenShell's 1,085 lines, each one on the same record.
IfcOpenShell gives no record this check misses.

Three details only showed up when the first runs did not match:

- **Repeats count.** A dental-clinic model writes
  `IfcMaterialLayerSet((#31918,#31917,#31918), 'Basic Wall...')`. That lists
  one gypsum layer record twice, once for each face. `ToMaterialLayerSet` is a
  bare inverse, so in EXPRESS each listing counts, and the layer belongs to
  "two" sets where the schema allows one. Counting distinct records missed it.
- **A broken record still points.** One model's `IFCSPACE` has 8 attributes
  where IFC2X3 gives 11. IfcOpenShell still reads it by position, so its
  placement is in use. Skipping the record made the placement look unused.
- **A pointer of the wrong schema.** An IFC4X3 file writes
  `IFCBEAMSTANDARDCASE`, which exists only in IFC4. Its 18 shapes are then
  used by no IFC4X3 product. The message names the beam record as the
  likelier fault.

## What the counts say about real files

Most of these do not change a value an IDS check reads, so each message says
what the count means for someone using the model:

- A Norwegian school model (IFC2X3) has 808 property sets each attached to
  between 2 and 169 types. Every type reads the same values, but editing the
  set for one type changes it for all of them.
- A dental clinic has 89 solids with between 2 and 8 styles each. The colour
  you see depends on which style a viewer picks.
- web-ifc's `advanced_model.ifc` has 34 distribution ports that belong to no element, so a system check
  cannot tell what they connect.
- In IfcOpenShell's own fixtures, every one of the 47 is a count of zero: a
  shape or placement nothing uses, or an opening that voids nothing (a quantity
  takeoff subtracts it from nothing).

One kind does change what an IDS check sees: an element in two storeys, or a door
that fills two openings. These links are `[0:1]`, and a `partOf` facet
follows them, so with two links the answer depends on which one a tool takes.
None of the 492 files has one, and the check is there for the first that does.

## Our own sample had the fault

The checker's demo model, `tiny-house.ifc`, listed its gypsum lining layer
twice in one set, the same way the dental clinic does. The new count caught it
the first time the sample tests ran. The sample now has two lining layers, and
its ifcXML and `.ifczip` twins were rewritten to match.

The method, every count and the commands to rerun it are in
[`eval/inverse-counts-2026-11-24.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/inverse-counts-2026-11-24.md).
The check runs in the browser, and the file never leaves your machine.
