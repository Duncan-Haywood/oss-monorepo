---
title: "Twenty number checks the IDS editor held back, and the 12 it still should"
seo_title: "IDS number checks with no class: what an editor should open"
date: 2026-11-17
tags: [bim, ifc, ids]
description: "IDS-Audit-tool's files ask for numbers on attributes with no class named. Eight now open as editor rows; twelve are list checks that always fail."
---

An IDS specification usually starts with a class: "every IfcDoor must...".
It does not have to. buildingSMART's IDS-Audit-tool ships test files whose
specifications name only an attribute ("anything with a
CoordinateSpaceDimension must have it equal to 3"). Our IDS editor opens most
of those as editable rows. Earlier today 20 number lists were still held as
written, and the note on them only said the page "does not type" them.

So I looked up each of the 20 attributes in the IFC2X3, IFC4 and IFC4X3
schemas: every class that declares it, its type, and whether it is stored,
derived or a list. They fell into three groups.

**Derived on a subclass (5 lists).** CoordinateSpaceDimension and Precision
are stored numbers on `IfcGeometricRepresentationContext`. Its subclass
`IfcGeometricRepresentationSubContext` redeclares both as derived, so they
are written `*` in the file. The editor took that as "typed differently" and
gave up. They are the same number everywhere they are stored, so they now
open as number rows, with a note naming the subclass. We checked that note on
buildingSMART's IFC 4.3 HVAC sample. A specification whose applicability is
CoordinateSpaceDimension itself leaves the subcontext out and passes. One
that selects anything with a ContextType picks up the subcontext, and it
fails.

**A count written as an integer (3 lists).** `IfcCountMeasure` is an EXPRESS
`NUMBER` in IFC2X3 and IFC4, so the editor writes a new BarCount or
CountValue check on `xs:double`. The test files write `xs:integer`. A checker
compares each value with the attribute's own type, so `27` means the same on
either base. The row now keeps the file's `xs:integer` and asks for whole
numbers.

**Lists (12 lists, all still held).** TexCoordsList, DayComponent,
ColourIndex, LuminousIntensity and three more are lists on every class that
has them. buildingSMART's own test case says a value check on a list always
fails. Turning these into editable rows would only make a broken check easier
to write. They stay held, and the audit now says why: "TexCoordsList is a list
on every class that has it (IfcTextureVertexList); IDS cannot compare it with
a value; every object this checks fails it". It is a warning, not an error,
because the IDS-Audit-tool calls these files valid. The audit's errors did
not change on any file in our corpora.

Result: 117 of the 129 number lists in the IDS-Audit-tool valid files open as
rows (was 109), and 90.7% of those files' facets can be edited. The full table
and the commands are in
[the evaluation](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/no-class-numbers-2026-11-17.md).

One caveat: none of the 64 public IDS files we track writes a check like
this. Only buildingSMART's synthetic test files do. If you write IDS without
naming a class, try the [IDS editor](https://marisstella.app/ids-model-check/editor.html)
and tell us whether these notes help.

*This is a free, open-source tool. It checks files against the IDS 1.0 rules
as we read them and is not a substitute for your project's own review.*
