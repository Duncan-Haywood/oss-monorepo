---
title: "Checking an IFC5 model against an IDS: 47 public files and 8 STEP twins"
seo_title: "Check IFC5 .ifcx models against IDS in the browser"
date: 2026-11-21
tags: [bim, ifc, ifc5, ids, ids-model-check]
description: "IDS Model Check now reads IFC5 alpha .ifcx files. On 8 STEP twins, classes agree on 12,115 of 12,116 objects; what differs is what the converters left out."
---

[IDS Model Check](../../ventures/ids-model-check/README.md) checks a building model against a buildingSMART IDS file in the browser, with nothing uploaded. This morning it learned ifcJSON. This afternoon it learned IFC5.

IFC5 is still an alpha. buildingSMART's [IFC5-development repository](https://github.com/buildingSMART/IFC5-development) publishes 47 example `.ifcx` files, and the format looks nothing like IFC4. There are no entities with numbered attributes. A file is a list of nodes, each with a `path`, `children`, `inherits` and namespaced `attributes`. Many nodes may talk about the same path, and a later one wins. That rule is how layers work: `hello-wall-add-fire-rating-30.ifcx` is three lines that give one wall a fire rating. A property is just an attribute, `bsi::ifc::prop::IsExternal: true`. There is **no property set**. A type is a node the occurrence `inherits`, and so is a material.

IDS 1.0 was written for IFC2X3 to IFC4X3, and every property facet names a property set. So the new reader, `ifcx.mjs`, translates. It composes the nodes and turns each node with a `bsi::ifc::class` into an IFC4X3 object. It rebuilds the spatial tree from `children`: aggregation, containment, voids and fills, plus nesting for ports and alignment layouts. Each property goes into the standard set whose buildingSMART template names it for that class. `IsExternal` on a wall lands in `Pset_WallCommon`, and `Height` lands in `Qto_WallBaseQuantities` as a quantity. A property no template names goes into a set named after its namespace (`bsi::ifc::prop`), so you can still check it. Classifications (`nlsfb::class`) and materials come along too. A material sitting on an object's unclassed parts, like a window type's Frame and Glazing, counts as the object's.

**How do we know it's right?** Eight of the examples sit next to the IFC file they were converted from, and the converters kept each object's GlobalId as its path. The UUID `93791d5d-…-2f1f0ba4bf3b` is hello-wall's wall `2JUHrTM_j3UxZiBnyBfByx`. That let us pair objects and write everything the reader produced as an IDS requirement on the object's own GlobalId. Then we checked that IDS on the STEP twin ([eval/ifcx-twins-2026-11-21.md](../../ventures/ids-model-check/eval/ifcx-twins-2026-11-21.md)):

| | result |
| --- | --- |
| public `.ifcx` files read | 47 of 47, 14,090 objects (0 before: they were taken for ifcJSON) |
| class the same as STEP | 12,115 of 12,116 paired objects |
| partOf links that hold on STEP | 1,646 of 1,648 |
| materials that hold on STEP | 5 of 5 |
| properties in a standard set that hold on STEP | 24 of 30; the other 6 are values STEP never had |
| TeklaHouse (42 MB) read and checked | 0.5 s |

The first run of that measurement found two mistakes, and both are fixed. Ports and alignment layouts are nested in IFC4X3, not aggregated. And windows came out with no material, because IFC5 puts it on their parts.

**What doesn't match is what isn't there.** We also checked 68 IDS files (the 3 starters and 65 public ones) against both forms. They gave the same status and failing elements on 371 of 544 runs. We grouped every difference by its reason. Each one is information that one file has and the other lacks. The alpha converters dropped every property of the Tekla house (315,659 of them). Railway and Road carry no IFC class at all. IFC5 alpha has no Description, ObjectType or Tag. None of the differences is a value that the two files read differently.

**One thing to know: names.** IFC5 alpha has no Name attribute. An object is named by the key its parent gives it, and the converters make that key an identifier. STEP's `SLB-150` becomes `SLB_150`, a repeat becomes `MIX_40_001`, and Tekla writes `NUT (12)`. The checker uses the key as Name. An IDS that asks for a name passes, but a name pattern written for the IFC4 export may not.

Layers work too. `node cli.mjs hello-wall.ifcx spec.ids --layer add-fire-rating-60.ifcx --layer add-specific-fire-rating.ifcx` composes them in order. The window type gets R30, and the instance path `…/Wall/Window_001` gives that one window R60.

Nobody exports IFC5 for production yet. But an alpha with public examples is exactly when to find out whether today's IDS files will still mean something tomorrow. On these files the answer is mostly yes, and the IDS fails on what the model doesn't carry. The checker is MIT licensed and runs [in the browser](../../ventures/ids-model-check/index.html) or as a Node command line.
