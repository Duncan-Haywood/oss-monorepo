---
title: "The 800-hour task that was really 400: how Microsoft Project counts a night shift"
seo_title: "Microsoft Project resource calendars and night shifts, explained"
date: 2026-11-21
tags: [construction, scheduling, microsoft-project, mspdi, cpm]
description: "Why a Microsoft Project task on a day and a night crew stores twice its span, and how XER Schedule Check now matches Project on 2,442 of 2,491 tasks."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a schedule's
dates in the browser and compares them with the dates the file stores. It
started with Primavera P6 `.xer` files. Since 2026-11-19 it also reads
Microsoft Project schedules saved as XML. On the 102 Project files in MPXJ's
public test set (saved by Project 2002 to 2019), it matched Project's own
early finish, late finish and total float on 2,406 of 2,491 open tasks. The
85 misses were written up as "resource-driven, split or timephased", and two
files as "not explained".

Today's run went back to the misses one file at a time. Two rules came out of
it, and the count is now **2,442 of 2,491 (98.0%)**. No task that matched
before stopped matching.

## A task that stores twice its own length

The oldest file in the set is a 2003 sample, and none of its 16 tasks
matched. Its stored project finish is 18 March. The recomputed one was
26 May, ten weeks later. That looked like a file someone had edited without
recalculating.

It wasn't. One task, "Second Task", stores a duration of 800 hours. Its own
start and finish, 7 January to 18 March, cover only 400 hours of the
project's day calendar. It has two resources, each on its own calendar. One
works days. The other works a night shift (its assignment starts at 23:00).
Add 400 hours of day time to 400 hours of night time over those ten weeks
and you get the 800 Project stores.

So the rule is: **Project counts a task's duration in the time any of its
work resources is working**, each on that resource's own calendar. A night
crew's 12-hour task works two nights, not a day and a half. A task with a
day crew and a night crew works both shifts, so it finishes sooner than
either crew would alone. The checker had been counting those 800 hours on the
day calendar, which runs to the end of May.

The reader now takes in the file's resources and assignments. A task with
work resources runs on the union of their calendars, holidays included. If
the task has its own calendar, each resource's calendar is first cut down to
the time it shares with it. If the task ticks "ignore resource calendars",
it stays on its own calendar. Material and cost resources don't count. In
the usual file every resource has an unchanged copy of the Standard
calendar, so nothing changes there.

That fixed the 2003 sample (16 of 16, finish 18 March) and a three-resource
test file with a night-shift resource (2 of 2). It also fixed the night-shift
and 24-hour tasks in Project's timephased test file.

## Work that stopped and restarts later

The second rule came from one test project saved by seven versions of
Project, 2002 to 2019. Each copy had the same two in-progress tasks finishing
days early. One task is 25% done and stopped at noon on 6 January. Project
stores where the remaining work picks up in a field called `Resume`. These
files have no status date, so the checker started the remaining work at the
first start date and finished it early.

An in-progress task's remaining work now starts no earlier than its Resume
date. When a status date falls after the Resume date, the work starts at the
status date, as P6 would. All seven versions now match 3 of 3. P6 files
have no such field, so nothing changes for an XER.

## What is still left, and why

49 tasks still differ, and the
[measurement note](../../ventures/xer-schedule-check/eval/resource-calendars-2026-11-21.md)
lists them:

- **38 are timephased or contoured work** in two test files. Their early
  finishes now mostly match (25 of 30 and 20 of 20). The late finishes are
  odd: each group of tasks has a late finish near the group's own latest
  finish, although no task has a successor. No logic rule produces that, so
  it is left alone rather than fitted.
- **4 come from a file that contradicts itself.** Ten unlinked tasks share
  one start date. Four of them store a late finish two working days before
  the project finish. A fifth task in the same position stores the project
  finish itself. No rule can match both.
- **4 are manual tasks** whose only successor is linked from their start,
  and **2 are split tasks**. Neither is modelled yet.

These are test projects, not construction jobs. The next useful file is a
real Project schedule with a night-shift or weekend crew. If you have one
you can share, the check runs entirely in your browser. Use File, Save As,
XML Format in Project and open the file on the
[tool's page](../../ventures/xer-schedule-check/). It is a screening tool
and doesn't replace a scheduler's review.
