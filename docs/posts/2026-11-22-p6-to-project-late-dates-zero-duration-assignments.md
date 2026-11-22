---
title: "Converting P6 to Microsoft Project: the four late dates that were a P6 rule, not a bug"
seo_title: "P6 to MS Project: why some late dates and float change"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, microsoft-project, xer]
description: "Two P6 activities with no time left but a labour row still running get an earlier late start in P6 than Project allows. XER to Project XML now flags them."
---

[XER Schedule Check](https://marisstella.app/xer-schedule-check/) converts a
Primavera P6 `.xer` export into a Microsoft Project XML file. To check it, we
take six public P6 schedules, write each one as Project XML, read it back, and
recompute both sides under Project's scheduling rules. Yesterday the dates
agreed on 19,818 of 19,822 open activities. The last four were in-progress
activities in a large P6 6.0 file (CCA, 14,270 open activities). Their early
dates agreed, but their late dates did not, and nobody knew why.

Today all 19,822 agree. Two separate things were going on.

## Five of them were in the check itself

When we ran the check again this morning it reported nine differences, not
four. Between the two runs, the Project XML reader had learned to apply
deadlines. The converter writes an external late finish (from a link to a
project outside the file) as a Project deadline, and once the reader honoured
deadlines, the read-back side moved. The reference side of the check still
threw the external late finish away, because that's how it was written when
the reader ignored deadlines. Three activities with external dates, and two
that precede them, went out of step. We changed the reference so it keeps the
date as a deadline, and those five agree again.

That's worth writing down because it's easy to miss. A check that compares
two pieces of code goes stale when only one side changes.

## The original four: a P6 rule with nothing to map to in Project

Two of the four, D03UR26001C0 and DP1CL26009C0, look finished on the activity
row: started, **0 hours remaining**. Each one still has a labour assignment
with no units left whose remaining dates run on past the data date. On one of
them the assignment runs from 1 October to 3 November 2011, and on the other
from 11 October to 21 December.

P6 rolls an assignment's late dates up to its activity, so an activity like
this gets a late start well before its late finish, as if it still had that
much work to do. Our CPM engine already copies that rule, because without it
we couldn't match the dates P6 stores. Microsoft Project doesn't work that
way. An assignment there lives inside its task's dates, so a task with no
duration left has its late start equal to its late finish. On DP1CL26009C0
that is the difference between 360.2 hours of total float (P6's rule) and 809
(Project's). The other two of the four are its predecessors, and they pick up
16.8 hours of float from the later late start.

So the converter was right and the check was wrong. The check was holding a
P6 rule up against Project's rules. The fix turns that rule off on the
"Project's rules" side. The useful part for anyone converting a schedule is
what the converter says now. When it writes the file, it lists these
activities by ID and warns that their late start, and the float of what comes
before them, can come out later in Project than in P6. It already gives the
same kind of counted warning for lags between calendars, start milestones,
level-of-effort activities and the rest. If you hand a P6 schedule to someone
who uses Project, this is one more place where their float won't match yours.

## How it was checked, and what wasn't

- Six public XER files (P6 5.0 to 24.12). 21,422 of 21,422 activities came back
  intact, all 54,843 links kept, and under Project's rules the dates agree on
  19,822 of 19,822 open activities. The full write-up is
  [`eval/msproject-latedates-2026-11-22.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/xer-schedule-check/eval/msproject-latedates-2026-11-22.md).
- Only the CCA file has activities like these (2 of them). A unit test plants
  one, and it also checks that an assignment that ends where it restarts isn't
  counted.
- We haven't opened the files in Microsoft Project itself, because there's no
  licence here. The claim that Project gives such a task a late start equal to
  its late finish rests on the writer putting each assignment on its task's
  dates, on Project's documented behaviour, and on our own reader. A P6
  Resource Usage export of one of these activities would show how P6 itself
  displays the rolled-up date.

The tool is free, runs in your browser, and is MIT licensed. Results are
estimates from the file you give it, so check them against your own scheduling
software before you rely on them.
