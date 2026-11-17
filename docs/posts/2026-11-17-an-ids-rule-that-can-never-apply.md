---
title: "An IDS rule that can never apply, and how to tell before you have a model"
seo_title: "IDS entity facets naming abstract IFC classes match nothing"
date: 2026-11-17
tags: [ids-model-check, bim, ifc, ids]
description: "IFCBUILDINGELEMENT is abstract in IFC2X3 and IFC4, and IDS matches exact classes, so a specification that names it selects nothing. The IDS audit now says so, with the classes to name instead."
---

buildingSMART's IDS (Information Delivery Specification) says what a building
model must contain: "every wall needs a fire rating" and so on. Each
specification starts with an entity facet that picks which objects it is about,
by IFC class name.

IDS 1.0 has no inheritance. An entity facet naming `IFCWALL` checks objects
whose own class is `IfcWall`, not the `IfcWallStandardCase` objects most IFC2X3
exports write. Some IFC classes are also *abstract*: they exist only to be
parents, and no object ever has one as its own class. `IfcBuildingElement` in
IFC2X3 and IFC4 is one: every wall, slab, beam and door is a subclass of it.

Put those two facts together and a specification that names
`IFCBUILDINGELEMENT` can never apply to anything.

## Where this showed up

The Dutch RVB BIM Norm v1.1, published as IDS in two open-source repositories,
has a required specification "2.2.7.8a Element materiaal" whose applicability
is exactly that class. Run it on a model and it reports "required, nothing
applicable". Earlier today, [ids-model-check](https://marisstella.app/ids-model-check/)
ran it on four public Revit and ArchiCAD exports: it failed on every one,
and 8,356 building elements sat under the class it named, none of them checked.
The failure reads as "this model has no building elements".

## What the audit says now

The checker audits every IDS against the IFC schema before it reads a model.
It now gives a warning, `class-abstract`, when an entity facet (in the
applicability, or the parent class of a "part of" facet) names an abstract
class. The warning says the specification applies to nothing, that a required
one will fail on every model, and lists the concrete classes to name instead:

> IFCBUILDINGELEMENT is abstract in IFC2X3 and IFC4: no object has it as its
> own class, and IDS class names do not include subclasses, so this
> specification applies to nothing, and being required it fails on every such
> model as "nothing applicable"; to check the objects below it, name their
> classes (IFCBEAM, IFCBUILDINGELEMENTPART, IFCBUILDINGELEMENTPROXY, IFCCOLUMN,
> IFCCOVERING, IFCCURTAINWALL, IFCDOOR, IFCFOOTING and 17 more)

It is per schema: `IfcProfileDef` is abstract in IFC2X3 but not IFC4, so a
specification for both is told it selects nothing in IFC2X3 models only.

## How often

On 64 IDS files from public repositories (507 specifications), the warning
fires twice: the two copies of the RVB file. On buildingSMART's own 334 test
files and the IDS-Audit-tool's 47 (954 specifications in all), it fires zero
times, so it is not noise. It is a warning, not an error: the file is valid
IDS, it just doesn't do what its author meant.

The audit runs with no model in the [checker](https://marisstella.app/ids-model-check/)
("Audit the IDS only") and live in the [IDS editor](https://marisstella.app/ids-model-check/editor.html).
Nothing is uploaded. Method and numbers: `ventures/ids-model-check/eval/abstract-classes-2026-11-17.md`.
