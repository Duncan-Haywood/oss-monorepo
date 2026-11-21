---
title: "Where Microsoft Project hides a split task, and why a schedule checker has to find it"
seo_title: "Split tasks in Microsoft Project XML: where the gap is stored"
date: 2026-11-21
tags: [construction, scheduling, microsoft-project, mspdi, cpm]
description: "Project XML has no split field; the gap sits in the assignments' timephased rows. XER Schedule Check now reads it: all 7 in MPXJ's corpus match."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads Microsoft
Project schedules saved as XML (MSPDI) as well as Primavera P6 `.xer` files.
It recomputes every task's dates and float and checks them against what
Project stored. On the 102 Project files in MPXJ's public test data it
matched 2,442 of 2,491 open tasks this morning. Two of the misses had the
same label in our notes: "split tasks, not modelled."

## What a split is

In Project you can split a task: cut it, drag the second half to the right,
and leave a gap with no work in it. Planners use it when a crew leaves a job
and comes back, for example while concrete cures or an inspection waits. The
task keeps its duration (80 hours of work is still 80 hours). Its finish,
though, moves out by the length of the gap.

A checker that ignores the gap gets the finish wrong. On the test file
`mspdisplittask.xml` the old reading put the project finish a week early,
on 11 October 2006 instead of 18 October.

## Where the gap is stored

The XML has no split field on the task. A task says only Start
2006-09-21, Finish 2006-10-09, Duration 80 h. Count the working hours
between those dates and you get 104. The missing 24 hours are in the
**assignment's timephased rows**: one row per day of remaining work
(`Type` 1), with the value `PT8H0M0S` on a working day and `PT0H0M0S` on a
day inside the split. Weekend rows carry no value at all, so a row with no
value is time off, and a row with a value of zero is a split.

## The rule

The reader now collects, for each task, the zero-work rows of all its
assignments. It keeps only the stretches that sit between the task's first
and last work, and only where no other assignment of the same task is
working (one person off while another works is not a split). The working
time in those stretches is added to the task's span in both the forward
and backward pass.

Two details matter in practice:

- **A split moves with the task.** If a new predecessor pushes the task a
  day later, the split keeps its length in working hours and moves with
  it. It does not stay pinned to its old dates. Project behaves the same
  way when it reschedules.
- **Splits already behind a task in progress add nothing.** Only the part
  after the task's Resume date (or the status date) counts.

## The result

| | before | after |
|---|---:|---:|
| open tasks matching Project on early finish, late finish and float | 2,442 | **2,446 of 2,491** |
| early finish alone | 2,483 | 2,490 |

The corpus has seven split tasks, and the reader finds every one: the two
in `mspdisplittask.xml` and five variants of one task in
`mspditimephased.xml` (day shift, night shift, 24 hours, 50% and 150%
units). That second file had been listed as "contoured work". It turns out
its five early-finish misses were splits too. All seven now finish where
Project says. The other 100 files read exactly as before, line for line.

Converting to P6 is the catch. P6 has no splits, so an XER written from a
Project file with split tasks loses them. The tool's warnings now say so
and count the split tasks.

## What is still open

The remaining 45 misses are mostly late dates in two timephased test files,
which no logic rule we know of explains. The bigger gap is that these are
small test projects. A real construction schedule with split tasks, saved
from Project, has not been through the reader yet. The full measurement is
in [`eval/split-tasks-2026-11-21.md`](../../ventures/xer-schedule-check/eval/split-tasks-2026-11-21.md).
The tool is free, runs in the browser and uploads nothing.
