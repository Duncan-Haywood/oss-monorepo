---
title: "Breaking 24 real IFC models on purpose: 358 seeded faults, each caught where it was put"
seo_title: "Seeded IFC faults: testing a WHERE-rule checker on purpose"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "We wrote 358 known faults into 24 public IFC models and checked that the free IDS checker's schema rules catch every one, and nothing else."
---

Earlier today the free [IDS model checker](https://marisstella.app/ids-model-check/)
learned to run the IFC schema's own WHERE rules: 677 in IFC4, run by a small
EXPRESS interpreter, and matched against IfcOpenShell on 26,013 failures in
492 public files. That comparison has a blind spot. Public files only exercise
the rules their exporters happen to break: 87 of about 1,800. The rules an IDS
check leans on hardest barely show up. In 492 files there were 3 failures of
`CorrectPredefinedType` and one of `UniquePropertySetNames`.

A rule nobody has seen fail might be wrong without anyone noticing. So we broke
some files on purpose.

## Eight faults an IDS check cares about

`eval/where-rules-seeded.mjs` takes a real model and writes one family of
fault into it at a time:

| Family | What it writes | The rule it should break |
| --- | --- | --- |
| USERDEFINED, unnamed | PredefinedType `.USERDEFINED.` with ObjectType (or a type's ElementType) cleared, one element per class | `IfcWall.CorrectPredefinedType` and its 100-odd siblings |
| Another class's type | A wall, beam or slab typed by an `IfcBuildingElementProxyType` | `CorrectTypeAssigned` |
| Duplicate set name | A second property set with an existing set's name on the same object | `IfcObject.UniquePropertySetNames` |
| Duplicate property name | One property copied into its own set | `IfcPropertySet.UniquePropertyNames` (IFC2X3: `WR32`) |
| Negative quantity | A length, area, volume, weight or count below zero | `IfcQuantityLength.WR22` and friends |
| Negative positive length | A door's or window's OverallHeight below zero | `IfcPositiveLengthMeasure.WR1` |
| 3D direction in 2D | A 3D `IfcDirection` as a 2D placement's RefDirection | `IfcAxis2Placement2D.RefDirIs2D` |
| 3D point in 2D | A 3D point as a 2D placement's Location | `IfcAxis2Placement2D.LocationIs2D` |

Then it runs the rules on the original and the seeded copy and asks three
questions. Did the rule fire on every seeded record? Did anything else start
failing? Did any failure the original had go away?

## The result

On 24 public models (ARCHICAD, Revit, Tekla, SketchUp, BlenderBIM and hand-written test
files, across IFC2X3, IFC4 and IFC4X3) that took 358 seeds. All 358 fired on
the record they were written into and under the rule they were aimed at. No
other failure appeared and none of the originals' failures were lost.

The first run did turn up one surprise. On one IFC2X3 file, a 3D point written
into a 2D placement also broke two more rules: `IfcCompositeCurve.WR42` and
`IfcArbitraryClosedProfileDef.WR1`. That placement positioned a circle. A circle
placed in 3D is a 3D curve, so the composite curve around it mixed dimensions
and the profile built from it was no longer planar. The checker was right, and
the seed was too blunt. The seeder now leaves conics' placements alone, so each
seed tests one rule, and the knock-on is written up as a finding.

The same seeded files then went through `ifcopenshell.validate` with
`express_rules=True`. On every copy IfcOpenShell can open, it gives the same
answer: 332 of 332 seeds, and the same new failures on all 109 copies. The
remaining 26 seeds are in two files with draft schemas (IFC4X2 and
IFC4X3_RC2), which IfcOpenShell refuses to open. Details are in
`eval/where-rules-seeded-2026-11-24.md` in the repository.

## The part users see

Finding the faults was only half the job. Until today the schema report and
the IDS results were separate blocks. A coordinator reading "W-02 fails
LoadBearing" had no way to tell that the same wall was also typed by a proxy
type, so its inherited properties come from the wrong class.

Now a failing row says so:

```
#21 IFCWALL "W-02": required Pset_WallCommon.LoadBearing: not found
  note: the model breaks IfcWall.CorrectPredefinedType: PredefinedType is USERDEFINED
        with no name for it, so a predefinedType facet's answer depends on the tool
  note: the model breaks IfcWall.CorrectTypeAssigned on its type #953
        IFCBUILDINGELEMENTPROXYTYPE: its type is another class's type, so the
        properties it inherits are not its own class's
```

The note follows the rule through the model. It covers the element itself,
its type object, a property set defining it, and a property set its type
carries. On the public files 3,261 elements would carry one. Most come from one
IFC2X3 export that names properties twice. Another 81 are bridge members typed
by proxy types, where an IDS asking for a beam type's properties reads a
proxy's.

The checker is free and MIT-licensed, and it runs in the browser with nothing
uploaded: [marisstella.app/ids-model-check](https://marisstella.app/ids-model-check/).
