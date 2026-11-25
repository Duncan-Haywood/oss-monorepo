---
title: "An EXPRESS interpreter in the browser: all 677 IFC4 WHERE rules, matched with IfcOpenShell"
seo_title: "IFC WHERE rules in a free browser check, matched with IfcOpenShell"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "The free IFC checker now runs every WHERE rule of IFC2X3, IFC4 and IFC4X3 from the schema text and agrees with IfcOpenShell on 26,013 failures."
---

The IFC schema is a program as well as a list of classes. Beside each class's
attributes, the EXPRESS text that defines IFC carries WHERE rules: conditions
every record of that class must meet. IFC4 has 677 of them. Some are geometry
housekeeping. Others decide what a model *means*:

```
ENTITY IfcWall ...
 WHERE
  CorrectPredefinedType : NOT(EXISTS(PredefinedType)) OR
    (PredefinedType <> IfcWallTypeEnum.USERDEFINED) OR
    ((PredefinedType = IfcWallTypeEnum.USERDEFINED) AND EXISTS (SELF\IfcObject.ObjectType));
  CorrectTypeAssigned : (SIZEOF(IsTypedBy) = 0) OR
    ('IFC4.IFCWALLTYPE' IN TYPEOF(SELF\IfcObject.IsTypedBy[1].RelatingType));
```

A wall marked USERDEFINED must say what it is in ObjectType. An IDS
`predefinedType` facet then reads ObjectType, so if it is empty the facet has
nothing to read. A wall's type must be a wall type, or the properties it
inherits are some other class's. Many rules call functions, 47 of them in
IFC4, with loops, local variables and CASE statements. Those functions build
directions and dimensional exponents as they go.

## What changed

[IDS Model Check](https://marisstella.app/ids-model-check/) now runs every one
of those rules, in IFC2X3 (363), IFC4 (677) and IFC4X3 (777). No rule is
written by hand. `where-rules.mjs` is a small interpreter for the part of
EXPRESS the IFC schemas use. It reads the rules, the DERIVE attributes, the
functions and the two global RULEs from the buildingSMART `.exp` files and
evaluates them on the model's records. That includes three-valued logic, in
which a rule fails only when it is FALSE, not when a value is missing. It
runs in the browser tab as part of every check of a STEP file up to 40 MB, and
from the command line with `node cli.mjs --conformance model.ifc`.

## Checked against IfcOpenShell

`ifcopenshell.validate` with `express_rules=True` is the reference
implementation, so both were run on the same 492 public files: IfcOpenShell's
own test files, buildingSMART's samples, opensourceBIM's and web-ifc's. Both
report **26,013 rule failures, on the same records**. The remainder:

- 21 failures only here, all in one file that declares IFC4X3 but writes an IFC4
  class. Material and type relationships then point at records that are not
  elements in IFC4X3.
- 18 only from IfcOpenShell, none of them a fault in the file. Ten are a Python
  `TypeError` inside its rule runner, logged as violations. That was a B-spline
  surface whose weights are all 1.0, read through an `ARRAY [0:n]`. Five are a
  derived attribute it cannot compute. Two are an indeterminate value it reads
  as true, where ISO 10303-11 says UNKNOWN.

Matching took five fixes, each found because a first run disagreed. A `SET`
must keep its members distinct, or both duplicate-property-name test files
pass. An `ARRAY` can start at index 0. Functions write into the entity values
they build. A record's values must be converted once, not once per pixel of a
65,536-pixel texture: one IFC 4.3 sample went from 20 s to 0.2 s. And two
vertex records at one point close an edge loop, as IfcOpenShell reads it.

It is also quick. On AC20-FZK-Haus (2.5 MB, 40,455 rule evaluations) it takes
0.31 s, and IfcOpenShell's rule runner takes 4.0 s for the same 165 failures.

## What the public files hold

118 of the 492 files break at least one rule. The biggest counts are geometry:
17,181 advanced faces bounded by trimmed curves, which IFC4 does not allow
there, and 4,068 negative lengths in one model's quantity sets. A
negative length is the kind of value an IDS range check reads without knowing
it is broken. 1,357 property sets hold two properties of the same name, so an
IDS property facet could read either value.

The rules an IDS check leans on hardest fire least. In 492 files there are 3
USERDEFINED types with no ElementType and one wall with two `Pset_WallCommon`
sets. Exporters mostly get these right, which is why it helps to be told when
one does not. On that object, the IDS answer depends on which value a tool
happens to take.

Method, every disagreement and the commands to reproduce:
[`eval/where-rules-2026-11-24.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/where-rules-2026-11-24.md).
