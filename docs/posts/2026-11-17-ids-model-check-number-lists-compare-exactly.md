---
title: "A list of numbers in IDS: one checker allows a millionth, the other wants every digit"
seo_title: "IDS numeric enumerations: tolerance vs exact match"
date: 2026-11-17
tags: [bim, ifc, ids]
description: "The IDS editor now writes one-of lists of numbers. IfcTester compares them exactly, so the list from a model names each value to the last digit."
---

An IDS requirement like "the door is 2100 or 2400 high" is an XSD
enumeration on `xs:double`. The [IDS editor](https://marisstella.app/ids-model-check/editor.html)
could already write a list of text values or of a standard's enumeration, and
a range on numbers, but not a list of numbers. buildingSMART's own
IDS-Audit-tool test files use such lists 129 times, and the editor held every
one of them as read-only XML.

Now number properties and attributes get a **one of** row, written on
`xs:double` or `xs:integer`. A value has to be a number IDS can read: `2,4`,
`5 mm` and `NaN` are refused, and so is `3.0` on an integer (write `3`). Of the
129 lists in the IDS-Audit-tool valid files, 109 now open as rows you can
edit, and they write back byte for byte.

## Where the two checkers part

With a model open, a number row whose objects hold a handful of values offers
**Allow exactly these values**. The first version listed them as the model
inventory shows them, at 12 significant digits. On the Schultz Residence
Revit export, a list of the windows' own ten heights passed all 25 windows in
this checker, and IfcOpenShell's IfcTester 0.9.0 failed 20 of them.

The reason is in IfcTester's `Restriction.__eq__`: an enumeration is tested
with Python's `in`, which compares floats exactly. This checker compares each
listed real with IDS's tolerance, a millionth of the value plus a millionth,
the same rule it uses for a single value. Revit writes heights like
2.8000000001193297 next to 2.8. To IDS's tolerance those are the same number.
To `in` they are not.

So the offer now names every value exactly as the model holds it. The
inventory keeps the exact numbers next to the 12-digit tally it displays: a
door at 2.4 and one at 2.4000000000000004 are one line in the summary and two
entries in the list.

## Measured on four real exports

On the four public Revit exports the editor is measured on, plus the sample
house, 663 number rows get a list offer. All 663 pass the model they came
from in this checker. Against IfcTester:

| Requirement | Same verdict and failing elements |
| --- | ---: |
| The offer, attributes | 27 of 27 |
| The offer, properties | 619 of 636 |
| The same values typed to 6 digits | 22 of 324 |

The 17 offers that still differ are property values in feet, square feet or
degrees. This checker converts them to SI with the file's own conversion
factor, and ifcopenshell uses its own table of unit names. The two results
end up one last digit apart.

The bottom row is the practical one. If you type a list from what a viewer
shows you, the two tools agree on only about one list in fifteen. The row says so, and suggests a range for real numbers: a range
rounded outward reads the same in both tools.

The method, the scripts and every number are in
[`eval/number-oneof-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/number-oneof-2026-11-17.md).
The editor runs in the browser and the model never leaves your machine.
