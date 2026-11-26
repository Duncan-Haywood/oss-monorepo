---
title: "A zero-length milestone can cost a crew a day: milestone calendars in P6 schedules"
seo_title: "P6 milestone calendars that hold back successor activities"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, calendar]
description: "XER Schedule Check now finds P6 milestones whose own calendar holds back the work after them, and shows what a 24-hour milestone calendar gives back."
---

A milestone has no duration, but Primavera P6 still puts it on a calendar.
That calendar decides where the milestone sits, and so where the work after it
can start.

Take a hand-over milestone on a trade calendar that has Fridays off. The work
before it finishes on Thursday at 16:00. P6 moves the milestone to that
calendar's next working start, which is Saturday at 08:00. The crew after it
works Monday to Friday, so it can't start until Monday. A zero-length activity
has cost that crew its Friday. Nobody chose that on purpose. It comes from
which calendar the milestone happened to be given.

## What the new check does

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a P6 `.xer`
export in your browser. Its recomputed dates match the ones P6 stored on
19,820 of 19,822 activities in six public files. The new panel, "Time
milestones hold back across calendars", schedules the file a second time with
every milestone on a 24-hour calendar (mandatory dates are kept). It then
lists:

- each milestone that sits later than its logic puts it, with every successor
  it holds back and the hours that successor loses on its own calendar;
- the activities that could start earlier;
- the total float that comes back, how many activities P6 marks critical that
  would not be, and whether the project finish moves.

The CLI gives the same output:
`node cli.mjs schedule.xer --milestone-calendars [--csv held.csv]`.

## What it found on public files

Two of the six public XER files have this problem:

- **A hotel job (P6 6.0).** Eight zone hand-over milestones sit on the
  Saturday-to-Thursday calendar. Four follow a Thursday 16:00 finish and land
  on Saturday, which holds Monday-to-Friday successors back 9 hours each. The
  other four cost their successors the 16:00 to 17:00 hour. With those
  milestones on a 24-hour calendar, 205 activities could start earlier and
  2,201 gain 1 to 24 hours of float. 115 activities that P6 marks critical
  have 8 to 24 hours of float. The finish doesn't move, because another chain
  with no milestone hand-over reaches it at the same moment.
- **An expressway job (P6 7.0).** The start milestone's calendar begins work
  at 08:00, but its six successors' calendar begins at 07:00. That costs one
  hour each, and 28 activities in all.

Is that float real? I rescheduled every gaining activity (2,001 of them),
delayed by its new float. In every case the finish held and nothing else ran
late. One more hour of delay broke each one. The method and the table are in
[the eval note](../../ventures/xer-schedule-check/eval/milestone-calendars-2026-11-20.md).

## Reading it

P6 isn't wrong. By its own rules a milestone takes its calendar. The check
can't tell whether the scheduler meant that. If the milestone is a crew's
start, its calendar may be right. If it marks a hand-over between trades, a
24-hour calendar (or the successor's calendar) is usually what was meant. In
that case the panel shows the time you get back, and which near-critical work
is less critical than it looks.

This finishes the item left open by this morning's
[calendar-slack check](2026-11-20-the-friday-p6-float-forgets.md). That
check had one activity whose delay ran into exactly this kind of milestone.

## Update, 26 November: work already under way

The first version left out one case. It only named a milestone when the
activity after it had not started. Take an activity that is already in
progress and has a finish-to-start link from the milestone. Under retained
logic, P6 holds that activity's remaining work until the milestone. So the
milestone's calendar costs it time in the same way. The panel counted that
activity among the ones that "could finish earlier", but it said no milestone
was holding work back. You could see the time being lost, but not where it
came from.

The check now lists that milestone too. It measures the activity's remaining
start ("B's remaining work, Monday 08:00, could start Friday 08:00, 8 h"). A
started activity reached by a start-to-start link is still left out, because
its start has already happened. Links into a milestone by finish-to-finish or
start-to-finish are left out as well. A red-team test found the gap. It is
written up with the other checks in the
[eval note](../../ventures/xer-schedule-check/eval/milestone-calendars-2026-11-20.md).
