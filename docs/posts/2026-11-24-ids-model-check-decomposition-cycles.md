---
title: "Two IFC assemblies that hold each other: valid to the schema, and IfcTester never returns"
seo_title: "IFC decomposition cycles pass the schema and hang IfcTester"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "A loop of two IFC records that are each other's parts breaks no schema rule, passes ifcopenshell.validate and hangs IfcTester. The free checker now names it."
---

An IFC model is a tree. A beam is part of an assembly, the assembly sits in
a storey, the storey is part of a building, and so on up to the project. An
IDS `partOf` check climbs that tree: "every beam must be part of an element
assembly".

What if the tree has a loop? Assembly A holds assembly B, and B holds A.
Nobody means to write that, but exporters, merge scripts and hand edits
can, and it takes one extra `IfcRelAggregates` line.

We wrote that line into 102 public IFC files four ways (187 copies) and
asked three tools about them.

**The schema mostly doesn't notice.** IFC has a rule against a record
listed among its *own* parts (`NoSelfReference`), but nothing against a
loop of two. A loop gets caught only by accident: if the whole already had a
parent, closing the loop gives it a second one, and a "[0:1]" count
overflows. That happens for storeys and buildings, which always have a
parent, so all 153 spatial and containment loops were caught. It does not
happen for assemblies, which usually sit in a storey and have no parent
assembly: **0 of 28 assembly loops** and 3 of 6 nesting loops (a port and
its element, two tasks, an alignment and its part) were caught.
`ifcopenshell.validate` with its EXPRESS rules reported nothing new on all 31
of those.

**IfcTester hangs.** Its `partOf` check climbs the parent chain in a
`while` loop and keeps no list of where it has been. On a loop, when the
class it is looking for isn't on the loop, it goes round forever. With a
60-second limit, it hung on exactly the 31 loops the schema missed and on
none of the 102 originals, which each take about a second. Anything built on
IfcTester inherits that.

**What the checker does now.** [IDS Model
Check](https://marisstella.app/ids-model-check/) always stopped on loops (it
remembers where it has been), but it listed an element as part of *itself*
when the walk came back round. It doesn't any more. Its schema pass now has a
`decomposition-cycle` finding for any loop through aggregation, nesting,
containment, groups, voids or fills: it names all 187 seeded loops, flags
none of the 102 originals, and gives each failing IDS row in or below a loop
a note:

```
#27: #27 IFCBUILDINGELEMENTPROXY, #28 IFCSLAB are each other's wholes
(#27 in #28 in #27, through IfcRelAggregates #991, IfcRelAggregates #990),
so the part-of tree has no top. ...
```

The fix in a model is to delete the relationship that closes the loop.

The full numbers, the seeding script and the IfcTester harness are in
[eval/decomposition-cycles-2026-11-24.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/decomposition-cycles-2026-11-24.md).
The checker is free and MIT licensed, and runs in your browser, so the model
never leaves your machine. Its results are checks against the files you give
it, not professional sign-off.
