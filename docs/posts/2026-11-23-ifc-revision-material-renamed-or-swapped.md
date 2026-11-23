---
title: "Seventeen material changes that were two renames: reading materials in an IFC revision compare"
seo_title: "IFC revision compare: material renamed or swapped?"
date: 2026-11-23
tags: [construction, bim, ifc, quantity-takeoff, change-orders]
description: "IFC materials have no GlobalId. How the free IFC Quantity Takeoff now tells a material renamed in place from a re-specified one, and prices each swap once."
---

When a new issue of a building model arrives, the estimator's question is
what changed that costs money. A wall given another material is one of those
changes. In an IFC file, though, a material has no GlobalId, so a comparison
tool can only see that an element's material name is different. It cannot see
whether the element was given another material or whether the material was
just renamed.

[IFC Quantity Takeoff](../../ventures/ifc-quantity-takeoff/) compares two
revisions of a model in the browser. Until today it listed each element whose
material name changed as its own line. On a real BlenderBIM house (Tulpstraat,
committed 12 times in 2024) one step had 17 of those lines, all "Unknown ->
brick" or "Unknown -> baksteen".

## What actually happened

The two files show it:

```
before: #67=IFCMATERIAL('Unknown',$,$);   #68=IFCMATERIALLAYERSET((#70),$,$);
after:  #67=IFCMATERIAL('baksteen',$,$);  #68=IFCMATERIALLAYERSET((#70),'brick',$);
```

The author named the walls' layer set "brick" and renamed its one material
"baksteen" (Dutch for brick). No wall got a new material. The 17 changes were
two renames.

## How the report tells them apart now

A STEP id like `#67` only means something across two files when the file was
edited in place. A Revit re-export renumbers everything. So the report checks
the elements first. If at least 80% of the elements matched by GlobalId keep
their own STEP id, the file was edited in place. That was 100% on every
Tulpstraat step, and 0 to 2% on a Revit series of a real house. Only then is
a material or a layer set whose name changed under one id listed as
**material renamed**. Each element changed only by that rename is marked "same
material entity, renamed".

The element is still listed as a change. A material name is the
specification, so whether "Unknown -> baksteen" changes a price is the
estimator's call, not the tool's.

Every material change is also grouped into a **material swap** line:
before -> after, with the count, the classes, the volume and the area. On
the last step of the Revit house, 30 material lines became 14 swap lines, one
per re-specification to price. There were no renames, because the ids were
not kept.

## Try it

Open [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/),
drop the later model, then drop the earlier one under "Compare with an earlier
revision". Nothing is uploaded. The method, the measurements and the limits
(no public ArchiCAD or Vectorworks series has been tried yet) are in
[eval/revision-diff-materials-2026-11-23.md](../../ventures/ifc-quantity-takeoff/eval/revision-diff-materials-2026-11-23.md).
