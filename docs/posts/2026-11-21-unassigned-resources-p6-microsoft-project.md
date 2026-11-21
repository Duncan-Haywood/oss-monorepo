---
title: "The resources nobody is assigned to yet: keeping a whole resource list on a Project to P6 round trip"
seo_title: "Keep unassigned resources from Microsoft Project to P6 and back"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer]
description: "A Project file sent to P6 and back lost every resource with no assignment yet. A new option keeps all 890 in MPXJ's test files, and their 17 notes."
---

A resource sheet is not only the people and plant already on the schedule.
Planners load the tower crane before its activities exist, keep a second
concrete crew on the list in case the pour sequence changes, and write the
hire terms in the resource's notes.

[XER Schedule Check](../../ventures/xer-schedule-check/) converts between
Primavera P6's `.xer` and Microsoft Project's XML both ways. Going from
Project to an XER, every resource made it into P6's resource table. Coming
back from the XER to Project XML, only the resources an activity used were
written. Anything unassigned disappeared on the second leg, and so did its
notes and calendar. Nothing said so.

## What changed

- A new option, **write every resource in the file** (a box on the page,
  `--all-resources` on the command line), writes the whole resource list.
  Resources with no assignment keep their calendar, notes and resource
  fields. No assignment changes.
- The default still writes only the resources the project uses, as P6's own
  assignment views do, but it now prints how many it left out and names the
  option. Before, they went silently.

## Measured

Every Microsoft Project XML file in MPXJ's public test corpus that has a work
or material resource (66 files, Project 2002 to 2019) went to an XER and back:

| | Only assigned resources | Every resource |
|---|---|---|
| Resources back in Project XML (of 890) | 408 | 890 |
| Resource notes back, same text (of 17) | 6 | 17 |

On six public P6 files, the full list is 502 resources. 33 of them have no
assignment in the exported project. All 502 come back from Project XML to an
XER under the same resource ID, name and type. No assignment changed, and P6's
import rules found no problem in any file written. The method, and what it
doesn't check (opening the files in Project itself, and P6's resource
hierarchy, which Project has no equivalent for), is in
`eval/all-resources-2026-11-21.md` in the venture.

It all runs in the browser tab. The schedule never leaves your machine.
