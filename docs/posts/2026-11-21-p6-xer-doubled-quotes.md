---
title: "Two quotes for one: how Primavera P6 escapes a quote in an XER file, and the 11 names we got wrong"
seo_title: "How P6 XER files escape quotes (and why names show \"\")"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer]
description: "P6 writes a quote inside an XER value as two. XER Schedule Check now reads them as one and writes them back that way: 22,260 of 22,260 names match MPXJ."
---

An activity in a public hospital schedule is named
`Readiness for ICU Building "Controlled Zone"`. In the `.xer` file Primavera
P6 exported, the line reads:

```
%R ... CM-GN ; (14) Readiness for ICU Building  ""Controlled Zone"" ...
```

P6 writes every double quote inside a value as two, even though the value
itself is not wrapped in quotes. [XER Schedule Check](../../ventures/xer-schedule-check/)
kept both characters. So that name showed `""Controlled Zone""` on the
results page, in the written review, in the CSV downloads and on the Gantt
chart. The Microsoft Project export already worked around it. Nothing else
did.

## Is that really the rule?

Every other part of the tool reads through this file reader, so before changing it we counted.
The six public XER files we test against (P6 5.0 to 24.12) hold 15 values
with a quote in them. All 15 use the doubled form: 10 task names, a resource
named `Prestressing Cables - 0.6""` (0.6 inch), two HTML notes and an
organisation description. None holds a single quote on its own. Hand-made and
converter files do (`Install 6" drain`), so a lone quote is still kept as
written.

## The fix, and how we checked it

The reader now turns `""` into `"` in every value, and the writer turns every
`"` back into `""`. We compared against MPXJ, the open-source reader most
schedule converters use:

- **22,260 of 22,260** task, resource and WBS names now match MPXJ's reading.
  Before the change, 11 did not.
- Of 5.47 million values in the six files, only those 15 changed.
- Written back out, **448,834 of 448,835** data rows match the original file
  byte for byte. The one exception is a calendar row that spans several
  lines, and its value reads back exactly.
- The recomputed critical path still matches P6's own dates on 19,820 of
  19,822 activities, as before.
- A Microsoft Project file converted to XER now writes a quote in a name as
  P6 does, and MPXJ reads all 11 quoted names back correctly.

It is a small bug. It is also the kind that makes a scheduler stop trusting a
tool: if the activity names look wrong, why trust the float? The full check is
in [eval/quotes-2026-11-21.md](../../ventures/xer-schedule-check/eval/quotes-2026-11-21.md).

Still open: P6 Web (24.12) wraps multi-line values in quotes. We have not seen
a P6 Web export with a quote in a one-line name, so we don't yet know whether
it doubles that one too. If you have one you can share with the private
details removed, it would settle the question.

XER Schedule Check runs in your browser, and the file is never uploaded. It
is free and MIT licensed. Results are estimates to check, not professional
advice.
