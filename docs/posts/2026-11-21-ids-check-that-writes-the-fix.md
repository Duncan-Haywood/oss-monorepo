---
title: "An IDS check that writes the fix: missing property values straight into the .ifc"
seo_title: "Write missing IDS property values into an IFC model"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "The free IDS checker now writes missing property values into a copy of the .ifc, refuses values that break another check, and leaves every other line alone."
---

A failing [IDS](https://marisstella.app/ids-model-check/) check gives a list:
112 walls have no `Pset_WallCommon.ThermalTransmittance`, 40 doors have no
fire rating. Then the work starts. Someone opens Revit or ArchiCAD, maps a
parameter to the right property set, exports again and checks again. Often
that someone is not the person who owns the model. Simplebim edits IFC data
directly but is a paid desktop tool. IfcOpenShell's IfcPatch and Bonsai do it
for people who write Python or use Blender.

Today the free checker gained a third path. After a failing check on an
`.ifc`, a new panel, *Write the missing values into the model*, writes into a
copy of the file:

- **values the IDS itself fixes**: a single `simpleValue`, or a list with
  one allowed entry;
- **values a person types**: *Download the to-fill table* gives a CSV with one
  row per element and property (GlobalId, class, name, set, property, data
  type, what the IDS allows). Fill in the *Value* column in Excel, LibreOffice
  or a text editor (`*` in the GlobalId column gives every listed element that
  value) and choose the file again. A value the IDS would reject, `EI90` where
  it allows `EI30 | EI60`, is refused with the reason.

The same thing runs from the command line:
`node cli.mjs --fill model.ifc spec.ids -o filled.ifc --to-fill todo.csv`.

## Writing into someone else's model carefully

The hard part is writing into an export without breaking anything else in it.
The rules the fill follows:

- **Property entities are never edited.** Exports share them between sets.
- **A shared property set is edited in place only when every element that
  uses it gets the same new values.** Otherwise the elements that change get
  a copy of the set, with its other properties carried over, and move to a
  new relationship.
- **A value inherited from a type is overridden on the occurrence**, the
  normal IFC pattern. The type itself is left alone.
- **Numbers go in the model's units.** The IDS says `0.2` (metres); a
  millimetre model gets `IFCLENGTHMEASURE(200.)`.
- **Every record it does not touch stays byte for byte the same.** New records
  go at the end of the DATA section with fresh GlobalIds and the file's own
  owner history.
- **The file is re-read before you can download it,** and every written value
  is tested against every facet on that element that names the property.

## What half a million test values turned up

The test bed was four real exports (three HHS Office models and a Revit
house, 4 to 40 MB, all IFC2X3) against 65 IDS files people have published on
GitHub plus our 3 starter files: 272 pairs. Each pair was filled twice: once
with only the values the IDS fixes, and once with made-up stand-ins for
everything a person would type. The stand-ins say nothing about real
projects; they exist to push the writer hard.

The writer wrote 562,594 values. All of them read back passing, and in all
142 filled files the changed lines were exactly the records the fill said it
had touched. IfcOpenShell opened every filled file whose IDS IfcTester
accepts (99). IfcTester, an independent implementation, passed all 45,374
written values it could check, and found 0 elements that were in the model
before newly failing anything.

Getting there took four fixes, each found by the sweep:

1. **A quadratic scan.** The code searched for the next `/*` comment from
   every record. In a file with no comments, each search ran to the end of
   the file. Two values on a 13 MB model took 60 s; they now take 1.2 s.
2. **Fixing one check could break another.** A value written for one
   specification can conflict with a different specification on the same
   element. Now every applicable specification must accept the value before
   it is written. If two specifications ask `EI30` and `EI60` of one wall,
   neither value is written and the table names the clash.
3. **A set named like a quantity set.** One public IDS asks for
   `BaseQuantities.NetFloorArea`. IFC2X3 exports already have an
   `IfcElementQuantity` called `BaseQuantities`, so the fill added a property
   set of the same name beside it. Our checker merged the two. IfcTester reads
   values only from the last set with a given name, so the existing `Height`
   quantity disappeared for it. The fill now refuses a set name the element
   already holds as anything other than a property set.
4. **Five million failing results.** One public IDS has specifications with no
   class, and on the 40 MB MEP model they fail 5.3 million times. The fill had
   kept a reason string for each one and ran out of an 8 GB heap. It now takes
   only counts from the checker and walks just the specifications it can
   write to. That pair now fills 324,432 values in 27.5 s.

One effect is not a bug but worth knowing about. An IDS with a specification
that applies to every entity ("everything is classified") also checks the new
property sets and relationships. They fail it exactly as the thousands of
sets already in the model do. The summary counts them separately so the
before and after numbers stay comparable.

## What it does not do yet

It writes property values only, and only into STEP files. Quantities,
attributes, classifications and materials are listed in the table but not
written. Most failing requirements in published IDS files are not single
fixed values, so the to-fill table matters more than the automatic part. The
next real test is a BIM manager's own filled table rather than our made-up
one.

The method and every number are in
[`eval/model-fill-2026-11-21.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/model-fill-2026-11-21.md),
and the writer is
[`model-fill.mjs`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/model-fill.mjs)
(MIT). As with every result from the checker, treat a filled model as a strong
first pass and look over what it wrote before you send it on.
