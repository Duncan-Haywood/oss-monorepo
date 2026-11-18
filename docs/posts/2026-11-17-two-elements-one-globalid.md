---
title: "Two elements, one GlobalId: what 163 public IFC files hold"
date: 2026-11-17
tags: [ids-model-check, bim, ifc, construction]
description: "IFC says no two objects share a GlobalId. 3 of 163 public models break that rule, and finding them exposed a parser bug in our IFC reader."
---

Every object in an IFC building model carries a 22-character `GlobalId`. The
standard says no two may share one (`IfcRoot`, uniqueness rule UR1), and
everything downstream of a model check relies on that. A BCF issue points
at an element by its GlobalId. A model-comparison tool matches this week's
export to last week's by GlobalId. [IDS Model Check](https://marisstella.app/ids-model-check/)'s
own GitLab report keys each failing element on it. If two elements share one,
the BCF issue selects both and the diff matches the wrong pair.

Until today the checker read GlobalIds and never said when two elements
shared one. Now it does, in every output: a block on the page, a warning in
the text report, CSV rows, a BCF topic per GlobalId, and in CI an annotation
on the element's line, a job-summary entry and a GitLab issue
(`--fail-on-duplicate-globalids` makes it fail the build). It does not change
the IDS verdict, because the IDS never asked about it.

## How common is it?

We ran it on 163 public files: the HHS Office and Schultz Residence exports
the earlier tests used, all 35 IFC files in buildingSMART's sample repository,
and all 121 in xBIM's test folders. Together they hold 179,721 rooted objects.

- **3 files** have a duplicate. In HHS Office `construction2.ifc` a column
  has the GlobalId of a floor slab. In an xBIM alignment sample two spaces
  share one. An xBIM parser test repeats one GlobalId six times on purpose.
- The six original HHS and Schultz exports have none. An earlier write-up said
  they "already had 1 to 3". A text search over the file does find a repeated
  22-character string, but it is the property name `TreadLengthAtInnerSide`,
  not a GlobalId. That note is corrected.
- On the largest file (HHS MEP, 665,224 entities) the check adds 130 to
  155 ms to a 1.5 to 1.9 s parse.

To make sure we weren't grading our own work, we counted the same thing with
IfcOpenShell. On the 133 files IfcOpenShell opens, the two tools give
identical groups, GlobalId by GlobalId and element by element. IfcOpenShell
does not open the other 30: most are schema versions it does not ship
(IFC4X1, IFC4X3 drafts), and a few are xBIM's deliberately broken test files.

## The bug the cross-check found

The first comparison was not 133 of 133. On xBIM's parser test IfcOpenShell
found six group objects sharing the GlobalId and we found five. The sixth ends its
name with `\S\'`. In the STEP format, `\S\` takes the next character and adds
128 to its code, so `\S\'` is "§" and the quote after it closes the string.
Our reader saw two apostrophes in a row, read them as an escaped quote, and
ran the string on into the next line. That lost the group and the project
object after it. Both now read correctly. Only 2 of the 163 files contain
`\S\'`, so this was a narrow bug. Without a second tool to compare against it
would have gone unnoticed.

Measurements, commands and the cross-check script:
[`eval/duplicate-globalids-2026-11-17.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/duplicate-globalids-2026-11-17.md).
The checker is free, MIT licensed and runs in your browser: nothing is
uploaded. It is a check against what the IDS and the IFC schema say, not a
design review or professional advice.
