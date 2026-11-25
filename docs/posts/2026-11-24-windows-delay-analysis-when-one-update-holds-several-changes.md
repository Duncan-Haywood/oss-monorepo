---
title: "Windows delay analysis when one P6 update holds progress and revisions together"
seo_title: "Windows analysis with several changes per P6 update"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, delay-claims]
description: "241 changes planted 2 and 3 to a window on six public P6 schedules: every split exact, 238 named, and the one sort of revision a windows analysis can miss."
---

A windows analysis splits each period between two schedule updates into two
parts. **Progress** is what the work did: activities that started late,
finished early or went slower than forecast. **Revisions** are what the
scheduler changed: links, durations, constraints, calendars. The usual way to
separate them is the half-step: take last month's schedule, put in this
month's progress, leave the revisions out, and see where the finish lands.

[XER Schedule Check](../../ventures/xer-schedule-check/) runs that split
across a whole series of P6 updates and names what drove each window. Earlier
checks planted one change per window. A real update is messier: a crew got
ahead *and* a link was deleted *and* a duration was cut, all in the same
month. So this time each window got two or three changes at once.

## What was run

The six public XER files the tool is tested on. From each, 3 series of 6
monthly updates, statused as planned, with a progress change and one or two
revisions planted in each window on the driving path. Each revision was picked
on the path the earlier changes in that window had left, the way a scheduler
edits one thing after another. The expected split comes from building the
half-step file directly. Full method and every number:
`ventures/xer-schedule-check/eval/windows-mixed-check-2026-11-24.md`.

| | 2 changes a window | 3 changes a window |
|---|---|---|
| windows with a change, split exactly | 77 of 77 | 72 of 72 |
| changes named on their own side | 111 of 111 | 127 of 130 |
| changes named on the wrong side | 0 | 0 |

## The revision a windows analysis can miss

Two of the three unnamed changes moved nothing, so naming nothing was right.
The third is a real limit of the method, and it applies to anyone's windows
analysis, not only this tool's.

In one window a link was deleted, which moved the driving path onto another
chain of work. Then a duration on that new chain was cut by 4 days, and the
finish came in 0.3 days before a third path took over. The 0.3 days land on
the revision side, correctly. But the activity that was cut is on the driving
path only in the in-between state, after the deletion and before the cut.
**No file holds that state.** It is not on the path at the start of the
window, not in the half-step, and not at the end. A reviewer who looks for
revisions on the driving path, by tool or by hand, will not find it.

When the revision side moves and nothing on the paths explains it, look at
revisions *near* the path, not only on it. A cheap test is to take one
revision back out of the current update and re-run. The next step for the
tool is to do that for each revision (it is in the venture's `NEXT.md`).

## Two "gains" that were not gains

The first run also left 7 of 21 planted gains unnamed. None of them was a
gain, and a reviewer can meet the same trap in a contractor's update:

- **An expected finish date.** If the project schedules with expected end
  dates and an activity has one, P6 works its remaining duration out from
  that date. Typing a smaller remaining duration changes nothing.
- **A finish held by a finish-to-finish predecessor.** Several activities in
  one file had FF links from two or three predecessors. Their finish waits on
  those predecessors, so less remaining work does not bring it in.

In both cases the tool showed a 0-day progress effect and named nothing,
which was right. If an update claims work is ahead but the finish does not
move, check for these two before you argue about the progress.

## Limits

The series are copies of one real file statused as planned, not real
consecutive updates (no public set exists). Three changes a window is still
fewer than a real update holds. The expected split comes from the tool's own
CPM engine, which matches P6's stored dates on most activities in the same
files but is not P6. These are screening numbers for reviewing a schedule,
not scheduling, contractual or legal advice.
