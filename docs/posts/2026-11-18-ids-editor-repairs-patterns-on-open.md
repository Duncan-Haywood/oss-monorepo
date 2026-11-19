---
title: "Nine regex anchors our IDS editor was quietly writing into public files"
seo_title: "IDS editor: repair ids.xsd faults and regex patterns on open"
date: 2026-11-18
tags: [bim, ifc, ids, regex]
description: "Our IDS editor now repairs one-answer schema faults as it opens a file. Patterns another checker would misread in what it saves: 9 to 0."
---

The [IDS editor](../../ventures/ids-model-check/README.md) is the half of our
free IDS model checker that writes IDS files: the buildingSMART format for
rules like "every space's Name looks like 01.02.003". Most people start from
an IDS someone else wrote, so the editor opens existing files. It also keeps
whatever it cannot edit exactly as the file wrote it, so saving changes
nothing you did not touch.

That rule had a cost. If the file had a fault, so did the copy the editor
saved.

## The pattern problem

IDS patterns are XML Schema regular expressions. In that dialect every
pattern already matches the whole value, and `^` and `$` are ordinary
characters. Many authors write `^\d{2}\.\d{2}\.\d{3}$` out of habit from
JavaScript or Python. Our checker reads that the way the author meant it.
IfcTester, the most widely used open checker, reads it as XML Schema says: a
value starting with a literal `^`. So every space fails, and the report says
the model is wrong.

Earlier today we added a repair for this to the checker page and the command
line. The editor didn't use it. Opening a public file and saving it straight
back left the anchors in.

## What changed

The editor now runs the same repair before it opens a file. That covers IDS
0.9 names, `IFC4X3` written for `IFC4X3_ADD2`, elements out of order, a bare
`&`, and patterns written for another regex engine. The open message lists
every change by line. A file with nothing to fix opens byte for byte as before.

Measured on 65 IDS files from public GitHub repositories and the 80 test files
of buildingSMART's IDS-Audit-tool, opening each one and saving it back:

| | public files | audit-tool files |
|---|---|---|
| pattern findings in what the editor wrote, before / after | 9 / 0 | 51 / 1 |
| written back valid with no pattern finding, before / after | 55 / 60 | 65 / 68 |
| facets editable on the page | 1,871, unchanged | 2,430, unchanged |
| repaired files asking what the original asked | 14 of 14 | 7 of 7 |

When a repaired file asks for something different, the only difference is a
rewritten pattern. That was checked by comparing the files again with every
pattern blanked out. Going from `^2[ab]` to `2[ab]` is the point of the fix.

The ids.xsd column barely moved: 5 to 4 public files still write back
invalid. That's because the editor's own writer already writes valid IDS 1.0
for every row you can edit. The 4 that are left need a decision from a person:
an author field that says "AI Assistant" instead of an e-mail address, a
classification with no system, and a file that writes `<n>` for `<name>`
throughout.

The numbers, the script and the per-file output are in the venture's
`eval/editor-open-repair-2026-11-18.md`. The editor runs in the browser and
uploads nothing.

*Estimates and checks from published files, not professional advice; confirm
anything surprising in your own tools.*
