---
title: "29 published IDS specifications name a list of classes; the editor now opens them"
seo_title: "One IDS specification for slabs, beams and columns at once"
date: 2026-11-17
description: "The free IDS editor now writes a specification for several IFC classes at once and offers only the property sets every one of them can carry."
tags: [ids-model-check, bim, ifc, ids]
---

A requirement like "every structural element carries a phase code" doesn't
belong to one IFC class. People who write IDS files know this. In the 64
public IDS files we test the [IDS editor](/ids-model-check/editor.html)
against, 29 specifications in 11 files apply to a list of classes:
`IFCSLAB IFCCOLUMN IFCBEAM IFCWALL IFCPLATE IFCROOF` in one, 147 MEP classes in
another. The median is seven.

Until today the editor held one class per specification. It could also take
that class's subclasses, because IDS matches exact class names, so
`IFCWALL` alone misses `IFCWALLSTANDARDCASE`. A list of unrelated classes
opened as raw XML. The editor wrote that XML back unchanged, but you couldn't
edit it.

## What changed

A specification now has an **Also applies to** field. Type
`IFCSLAB, IFCBEAM` and the editor writes one entity facet that names every
class. An object matches if its class is any of them.

The harder part is what the editor offers next. A requirement in that
specification has to make sense for every class on the list, so the editor
narrows its choices to what they all share:

- **property sets:** only the standard sets every class can carry.
  `Pset_WallCommon` drops out once a slab is on the list. Seven sets are left
  for walls, slabs and beams together, among them
  `Pset_EnvironmentalImpactIndicators` and `Pset_ManufacturerTypeInformation`.
  A project's own set (`Acme_Common`) is still allowed, because it isn't tied
  to a class;
- **attributes:** the ones every class has. The editor offers a list of
  allowed values only when that list is the same on every class.
  `PredefinedType` is a slab-type list on a slab and a beam-type list on a
  beam, so for both together you can require that it is set but not pick a
  value;
- **predefined types:** only the ones every class allows. For a slab and a
  beam that leaves `USERDEFINED` and `NOTDEFINED`.

Change the list and the editor clears a property-set row or predefined type
that no longer fits every class, so you can't save a specification that asks
a beam for a wall's property set.

## Checked on files other people wrote

We open every public file, write it back and compare the two facet by facet.
We count it as a pass only if the written file asks for exactly what the
original asked:

| | before | after |
| --- | ---: | ---: |
| public files that write back the same | 64 of 64 | 64 of 64 |
| facets you can edit | 1,598 (79.4%) | 1,631 (81.1%) |
| files where every facet is editable | 8 | 10 |
| class facets kept as raw XML | 50 | 21 |
| made invalid against buildingSMART's `ids.xsd` | 0 | 0 |

The 21 class facets still kept as raw XML are name patterns, mixed-case
names like `IfcSpace` (the audit flags those), and classes the file's schema
doesn't have.

Half the requirements in those 29 specifications still open as raw XML, and
that's on purpose. Most ask for a standard set that only some of the listed
classes can carry, such as `Pset_ManufacturerOccurrence` on a list that
includes a roof. The editor won't let you write that kind of requirement. It
keeps an existing one exactly as written, and the
[checker](/ids-model-check/) points it out.

Next: property and attribute facets in the applicability ("walls whose
`IsExternal` is true"). That's the largest group of facets still kept as raw
XML. The measurements are in
[`eval/several-classes-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/several-classes-2026-11-17.md).

*The checker and editor are free, run in your browser and upload nothing. They
help you write and check information requirements. They aren't a substitute
for your project's own review, and they don't give legal or contractual advice.*
