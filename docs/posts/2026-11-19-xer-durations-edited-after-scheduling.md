---
title: "A seventh P6 file disagreed on 25 activities. The engine was right: eight durations were edited after F9"
seo_title: "Spotting P6 durations edited after the last schedule run"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer]
description: "How XER Schedule Check tells a P6 file that was not rescheduled after edits from one whose logic does not produce its dates, checked on 300 planted edits."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a Primavera
P6 schedule from its `.xer` export and compares the result with the dates P6
stored. On six public P6 exports it agreed on 19,820 of 19,822 open activities.
Its own notes warned that six files from six sources is a small sample.

So today a GitHub code search went looking for a seventh. The API returns only
300 hits per query, so the search was split by file size to reach past that.
It found one P6 export with scheduled dates that none of the six cover:
*Harbour Pointe Assisted Living Center*, exported from P6 17.12, 113 open
activities.

## 88 of 113

The first run agreed on only 88. The 25 misses did not look like one missing
rule: early finishes, late finishes and floats were all off, by days to weeks,
in both directions.

Activity EC2170, *Unit Finishes Building South, Floor 3*, gave the answer. The
file gives it a remaining duration of 2,208 hours. Its stored early start and
finish span 1,968 working hours on its calendar, the same as its twin on the
floor below. Its planned finish does fit 2,208 hours. So someone changed the
duration after P6 last scheduled the project, and the file went out without
pressing F9.

Eight unstarted activities are like that, among them shop drawings (90 days in
the file, 87 between the stored dates), the garage punch list (18 against 12)
and final inspections (115 against 90). Reschedule with the durations the
stored dates imply and the engine agrees with P6 on **113 of 113**. The engine
was right about the file; the file had moved on since P6 last scheduled it.

## Why a reviewer cares

An owner's rep reviewing a monthly update reads the float and the critical path
off the stored dates. If durations were changed after the last schedule run,
those dates describe a schedule that no longer exists: here, final inspections
grew by 25 working days without moving anything downstream. "Your stored dates
disagree with the logic on 25 activities" is a finding. "Eight durations were
changed without rescheduling, and those eight explain all 25" is a finding the
contractor can act on in a minute.

So the assessment now does that. For every unstarted activity it compares the
work between the stored early dates with the remaining duration. Each one that
differs goes on a list, *Durations edited after the last schedule run*. The
tool then reschedules with the implied durations and says how many of the
stored-date differences that accounts for. A difference the edits do not explain
stays on the list unexplained, because something else is wrong there. The
written review turns the list into a medium correction: reschedule and
resubmit.

## Checked on planted edits

On each of the six files P6 had just scheduled, ten runs each changed five
unstarted durations by 1 to 20 working days without rescheduling:

- 300 planted edits, **300 found, 0 extra**;
- 9,066 stored-date differences caused, 9,046 explained. The other 20 are the
  big programme's two known residuals, once per run, correctly left
  unexplained;
- none of the six files lists anything as found.

Only unstarted activities are checked. An in-progress activity's remaining
duration changes with progress, so its stored dates cannot show what it was. The
measurements and the method are in
[`eval/edited-durations-2026-11-19.md`](../../ventures/xer-schedule-check/eval/edited-durations-2026-11-19.md).

The tool runs in the browser and the file never leaves your computer. It
screens a schedule; it does not replace a qualified scheduler's review.
