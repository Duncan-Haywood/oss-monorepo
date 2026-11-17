---
title: "An IDS check on IFCBUILDINGELEMENT checks nothing, and now the audit says so before any model"
seo_title: "IDS abstract class: why IFCBUILDINGELEMENT applies to nothing"
date: 2026-11-17
description: "IfcBuildingElement is abstract, and IDS has no inheritance, so a specification naming it applies to no object. The free IDS audit now flags it from the file alone and lists the classes to name instead."
tags: [ids-model-check, bim, ifc, ids]
---

An IDS file says what an IFC model must contain. Each specification starts with
an applicability, usually an entity facet: "for every `IFCWALL`...". That facet
matches an object's own class and nothing else. IDS has no inheritance, so
`IFCWALL` does not pick up an `IfcWallStandardCase`.

Some IFC classes are abstract. No object is ever of that class itself; every
building element is a beam, a column, a wall or one of the others below it.
`IfcBuildingElement` is abstract in IFC2X3 and IFC4. Put it together with the
exact-class rule and a specification on `IFCBUILDINGELEMENT` matches no object
in any model.

That is not hypothetical. Earlier today we ran 65 public IDS files against four
real IFC2X3 exports through the [IDS Model Check](/ids-model-check/) CI runner.
Two copies of the Dutch RVB BIM Norm v1.1 have one specification on
`IFCBUILDINGELEMENT`, marked required. On all four models it applied to 0
elements and failed with "nothing applicable", while 8,356 building elements
sat under that class. To someone reading the report it looks like the model has
no building elements.

## Caught from the file alone

The model run already said which elements the facet missed. But the fault is
in the IDS, so the audit, which runs on the IDS with no model, can catch it the
moment the file is written. It now does:

```
IFCBUILDINGELEMENT is abstract in IFC2X3 and IFC4: no object is ever of that
class itself, and IDS matches exact classes (no subclasses), so the
specification applies to no object; list its concrete subclasses instead (36:
IFCBEAM, IFCBEAMSTANDARDCASE, IFCBUILDINGELEMENTPART, IFCBUILDINGELEMENTPROXY,
IFCCHIMNEY, IFCCOLUMN, IFCCOLUMNSTANDARDCASE, IFCCOVERING, ...)
```

In the applicability it is a warning: the file is valid IDS, and other
checkers such as IfcTester run it the same way. As a required entity
*requirement* it is an error, because every element the specification applies
to would fail for a fault that is the author's, not the model's. The rule
leaves alone IFC2X3 names from buildingSMART's type mapping table, which do
match through an object's type.

## How much it changed

- On the 65 public IDS files, it flags 2: the two RVB copies, and no others.
- The buildingSMART IDS test suite output is identical (334 of 334 test pairs).
- The editor offers 203,433 specifications, and they still raise no error or warning.
  The editor only ever offers concrete classes.

The bundled schemas have 97 abstract classes of 653 in IFC2X3, 123 of 776 in
IFC4 and 133 of 876 in IFC4X3. Few authors will name one on purpose. But
"building element" is a natural thing to want to check, and the class with
that name is one an IDS cannot use.

Run the audit at [the checker](/ids-model-check/) ("Audit the IDS only") or
with `node cli.mjs --audit spec.ids`. Measurements are in
`ventures/ids-model-check/eval/abstract-class-2026-11-17.md`.

*Not engineering or compliance advice; check results against your project's
requirements.*
