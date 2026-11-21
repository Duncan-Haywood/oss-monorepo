---
title: "Microsoft Project to a P6 XER without P6: what the import needs, and how we checked it"
seo_title: "Convert Microsoft Project XML to a Primavera P6 XER, free"
date: 2026-11-21
tags: [construction, scheduling, primavera-p6, xer, microsoft-project]
description: "XER Schedule Check now writes a P6 XER from a Microsoft Project XML file, in the browser: checked on 143 Project files and six P6 files sent through Project."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) already turned a
Primavera P6 `.xer` into a Microsoft Project file for people who hold Project
and no P6 seat. This run added the other direction, which is the more common
request on a job: **a planner who schedules in Microsoft Project is told the
owner or the general contractor wants the schedule as an XER.**

The usual answers are a paid converter, borrowing a P6 seat with Project
installed on the same machine, or retyping the schedule. Now it is: save the
plan from Project as XML (File, Save As, XML Format), open it on the page, press
**Download for Primavera P6 (.xer)**. Nothing is uploaded.

## What P6's import actually needs

The tool could already read Project XML into P6's tables, because every check
(DCMA, critical path, risk, levelling) runs on those tables. That turned out to
be a long way from a file P6 would import:

- **Ids.** P6 wants whole numbers that resolve. The reader had made up text
  ids for some calendars (`mspdi-24h` for elapsed durations, `mspdi-res-1` for
  a task running on its resources' calendars) and for code types.
- **A project node.** Every WBS in P6 hangs from one node that is the project
  itself. Project has no such row; its summary tasks start at level one.
- **Fields.** The reader kept only what the checks read. A P6 20.12 export
  writes 60 fields per activity and 70 per project. The writer now emits every
  field P6 20.12 writes in each of its 14 tables (taken from a real export's
  `%F` lines), with P6's defaults where Project has nothing to say.
- **Activity IDs.** Project numbers its rows; P6 wants IDs that people
  recognise and that never repeat. If the Project file has a text column named
  "Activity ID" (as our own XER-to-Project converter writes), those come back;
  otherwise row 12 becomes A120, the P6 habit of numbering in tens.

A small checker (`p6Problems`) now states the import rules the file must meet,
and every converted file is checked against it.

## Two things we got wrong first

**Work that restarts later.** In 17 of 2,509 tasks the dates came out earlier
in the XER than in the Project file. All were in progress, with Project's
*Resume* date: the remaining work restarts on a later day than the data
date. P6 has the same idea under another name, *suspend* and *resume*. With
those two fields written, all 2,509 match.

**Actual dates after the data date.** Two Project files record work as done
after their status date. The first version of the writer moved the data date
to the latest actual date. On one real P6 file sent through Project and back,
that shifted every date in a 16,000-activity schedule, because its own actuals
run ten months past its data date. So now the file's status date always
stands, and the late actuals are counted in a warning (P6's schedule log will
list them too). Only a file with no status date gets the latest actual date
as its data date.

## How it was checked

There is no P6 seat here, so three stand-ins, all written up in
[`eval/p6xer-check-2026-11-21.md`](../../ventures/xer-schedule-check/eval/p6xer-check-2026-11-21.md):

1. **143 Microsoft Project files** from the test corpus of MPXJ (the
   open-source library most schedule converters are built on), saved by
   Project 2002 to 2019. None breaks the import rules. Read back, 2,520 of
   2,520 tasks are intact, 65 of 65 links and 181 of 181 code values come
   back, and the recomputed schedule is equal on all 2,509 open tasks.
2. **MPXJ reads both files the same way**: name, start, finish, actual
   dates, constraint, predecessors and resource assignments on 2,520 of
   2,520 tasks, and remaining duration on 2,518 (one rounding at 0.01 h, one
   blank read as zero).
3. **Six real P6 files, sent through Project XML and back.** Every one of
   21,739 activity IDs returns, with 54,843 of 54,843 links and 276,042 of
   276,042 activity code assignments. Getting the codes right meant rebuilding
   P6's code hierarchy: where the same code sits under two parents, the
   Project file holds the whole path (`321.328`), and the writer turns that
   back into a tree. The schedule matches on 19,818 of 19,822 open activities;
   the 4 that differ already differ in the XER-to-Project step.

## What it does not carry

The page lists these for the file in hand: task notes, Project's deadlines
(P6 has no such field), elapsed lags on links (P6 sets one lag calendar per
project), cost resources (P6 keeps those as expenses), custom number and date
fields, and split tasks. Not imported into P6 itself yet; if you hold a P6 seat
and try a file, the result is the most useful thing we could learn next.

The tool is free and MIT licensed, and it runs entirely in your browser:
[marisstella.app/xer-schedule-check](https://marisstella.app/xer-schedule-check/).
It is not professional scheduling advice; check any converted schedule before
you submit it.
