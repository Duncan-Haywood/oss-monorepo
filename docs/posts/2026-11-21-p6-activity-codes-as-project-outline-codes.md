---
title: "P6 activity codes as Microsoft Project outline codes, with the code tree intact"
seo_title: "Convert P6 activity codes to Microsoft Project outline codes"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "The free XER to Project XML converter can now write P6 code types as outline codes with their hierarchy and descriptions. MPXJ reads 179,400 of 179,400 values."
---

In Primavera P6, activity codes are how a scheduler slices a job: Phase,
Area, Responsibility, Trade. Many are trees. "Area A" holds rooms 001 to 012,
and so does "Area B", and each value has a description ("Room 1 east").
When [XER Schedule Check](../../ventures/xer-schedule-check/) converts an XER
for someone who has Microsoft Project and not P6, those codes so far went
into Project's spare text columns. The grouping still worked, but the tree
came out flat. Two rooms called 001 had to be written as `A.001` to stay
apart, descriptions could only ride along as "CON - Construction", and 29
columns were shared with the user-defined fields.

Project has a field made for this: the **outline code**. Each one has a
lookup table, a list of allowed values with parents and descriptions, and
Project shows it as a tree in the picker and rolls it up when you group by
it. With the new **outline codes** box on the page (or `--outline-codes` on
the command line), the ten code types with the most assigned activities
become Outline Code1 to Outline Code10. Each one's lookup table holds that
type's whole P6 dictionary, including values no activity uses yet. The
other code types stay text columns, as before.

## Checking a form nobody documents well

The last time this was considered, outline codes were left out. Their XML
form (lookup tables, masks, GUIDs) is the part of the Project XML schema
where readers disagree most, and we have no copy of Project to try a file
in. So this time the form came from [MPXJ](https://github.com/joniles/mpxj),
a widely used open-source library for reading Project and P6 files. We
built a lookup table in MPXJ, had its writer save it, and copied what it
wrote. MPXJ's reader accepts two ways for a task to point at a value:
Project 2003's value ID and Project 2007's value text with a GUID. The
converter writes both, the same way it already writes calendars in both
versions' forms.

Then every public P6 file we have that uses codes went through it: four
files, 19 code types, 434 lookup values and 179,400 code assignments.

- Read back by this tool's own Project XML reader, all 434 lookup values
  have the same code, parent and description, and all 179,400 assignments
  land on the same code at the same place in P6's tree. That holds with
  only the 2003 form in the file, with only the 2007 form, and with the
  2007 form stripped of its GUIDs.
- Read by MPXJ: 19 of 19 field names, 434 of 434 lookup values and 179,400
  of 179,400 task values match what was meant, from both forms together
  and from each one alone.
- Converted back to an XER for P6 import, the tree is still there: 179,400
  of 179,400 assignments sit under the same chain of parent codes. The
  reverse converter used to rebuild trees only from dotted text, so this
  needed a fix too.

On the largest file, a public 16,146-activity schedule with 37 code types,
33 types now make it into Project, against 24 when everything had to fit
in text columns.

## What is still open

Nobody has opened one of these files in Microsoft Project itself. MPXJ is a
careful, independent reader, and its own writer is where the format came
from, but Project could still want only one of the two task forms. That is
why the box is off by default. Anyone with Project and a P6 file can settle it: tick the box, open the
file and see whether the lookup tables load. The method and every number
are in
[`eval/msproject-outline-2026-11-21.md`](../../ventures/xer-schedule-check/eval/msproject-outline-2026-11-21.md).

The tool runs in your browser tab and uploads nothing. It is free and MIT
licensed. Its output is a starting point for your own review, not a
scheduling or contractual opinion.
