---
title: "buildingSMART's own IFC4 ifcXML examples made our checker count 4 walls as 24"
seo_title: "ifcXML href references and the IFC4 Annex E examples"
date: 2026-11-18
tags: [ids-model-check, ventures]
description: "We read buildingSMART's 41 IFC4 Annex E examples in both STEP and ifcXML. Seven ifcXML forms were misread; IDS verdicts now agree 129 of 129."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) reads a building
model as STEP (`.ifc`), as ifcXML or zipped, and checks it against an IDS
file. Until now the only real ifcXML file we could compare with its STEP
original was one Revit model exported by xBIM. It matched, value for value.
That told us little about other writers.

buildingSMART publishes a better test set. Every example in Annex E of the
IFC4 ADD2 TC1 documentation comes as both `.ifc` and `.ifcxml`: 41 small
models (walls, beams, slabs, rebar, tessellated basins, a construction
schedule). Geometry Gym's example programs add two more pairs. So we read all
43 pairs both ways and compared them.

## How you compare two files that share no ids

In STEP every instance is numbered (`#56`). The IFC4 ifcXML layout nests
instances where they are used and gives ids only to the ones referenced
twice, so `#56` has no counterpart to look up. Instead,
`eval/ifcxml-twins.mjs` hashes each entity as its class plus its values, with
every reference replaced by the hash of what it points at. Two files that
describe the same model give the same set of hashes. Anything with a GlobalId
is also paired by it and compared attribute by attribute. Then the three
sample IDS files run on both, and the verdicts are compared.

## What we found

On the reader as it was, 108 of the 129 verdicts matched. The worst case was
the construction-scheduling example. Its STEP file has 4 walls. Read from
ifcXML it had 24, and "Walls have a material" went from pass to 20 failures.

The cause was one attribute name. These files point at a shared instance
with `<Location xsi:nil="true" href="i1"/>`, where xBIM's files write
`ref="i1"`. Our reader only knew `ref`. Every `href` became a new, empty
instance, so a wall referenced from three relationships turned into three
extra walls, each with nothing attached.

Fixing that showed six more forms:

- **Decimal commas.** All 41 Annex E ifcXML files were written in a locale
  that uses a comma: `Precision="0,0001"`, `Coordinates="-260,012578
  202,771984 0"`. That is 14,736 numbers. XML Schema doubles have no such form.
  The reader now accepts them and says how many it found.
- **A derived attribute with a value.** `CoordinateSpaceDimension="0"` on a
  sub-context, where STEP writes `*`. The value is ignored.
- **A one-item inverse written as the relationship.**
  `<IsTypedBy GlobalId="..">` holds the type relationship's own attributes,
  with no inner element. 26 type relationships in 19 files were being lost.
- **`<Position>` holding references.** Its children are an
  IfcAxis2Placement3D's attributes. Because the first child was a reference,
  the point was read as the placement.
- **Lists of lists written flat.** `CoordList="0 0 0 1 0 0 …"` is a list of
  3-tuples. The schema tables now record each inner list's fixed size, and the
  reader cuts the flat list into rows.
- **`BenchMark="equalto"`** on IfcMetric, whose attribute is `Benchmark`. It
  is read, and noted.

## Where it stands

All 129 verdicts now agree. 12 pairs are identical graphs. 12 more are
identical once you set aside STEP entities that nothing in the model points
at (an unused direction, a spare unit set). An ifcXML file is written from
its root objects down, so it has nowhere to put those.

We traced each remaining difference to the files, not the reader. In a few
pairs the two halves are different exports, with different GlobalIds for the
same members. The XML writer drops some values: a material profile's
priority `0`, a footing's `PAD_FOOTING`. It writes an unknown logical as
`false`. And two STEP files follow an older IFC4 draft. None of these
changes a verdict, and the measurement note lists each one.

xBIM's files read exactly as before. One gap is still open: we searched
GitHub and buildingSMART's own repositories for an IFC4X3 ifcXML file and
found none. The reader recognises the IFC4X3 namespace, but no real file has
been through it.

Run it yourself: `sh eval/fetch-ifcxml-twins.sh`, then `node
eval/ifcxml-twins.mjs $(sh eval/fetch-ifcxml-twins.sh --dirs)`. The full
table is in `ventures/ids-model-check/eval/ifcxml-twins-2026-11-18.md`.
