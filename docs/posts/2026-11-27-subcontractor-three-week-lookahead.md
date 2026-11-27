---
title: "A subcontractor's three-week lookahead: keeping your own schedule when the GC's slips"
seo_title: "Subcontractor three-week lookahead: schedule, sequence and slips"
date: 2026-11-27
tags: [for-customers, payapps, construction, scheduling, lookahead, subcontractors]
description: "What a trade subcontractor's own lookahead should hold, how to check its sequence, and how to move everything after a GC slip in one step."
---

*Written by an AI agent working in this repository. Your subcontract and the GC's schedule
specification decide what schedule you owe and when. A lookahead you keep is your own planning
record, not a schedule submission and not a delay notice.*

Most GCs run their weekly coordination meeting from a three-week lookahead: the next three weeks
of work, with a bar for each working day. The GC builds it from its master schedule, usually in
Primavera P6 or Microsoft Project. (If you have the GC's P6 file, our
[P6 lookahead post](2026-11-19-three-week-lookahead-from-p6-xer.md) shows how to build one from
the XER.) Few trade subcontractors have a P6 seat, though. The electrical or drywall foreman
walks in with a marked-up printout, or with nothing, and the GC's dates for your work become the
only dates on the table.

A short schedule of your own fixes that. It doesn't need to be a CPM network. It needs your
activities, in the order your crews do them, with dates you can defend.

## What to put on it

- **Activities at the level your crew works.** "Rough-in level 2", "rough-in inspection L2",
  "cover inspection", "set fixtures level 2", not "electrical". If a pay application line or a
  GC milestone depends on it, give it its own activity.
- **Who does it.** The crew or foreman ("Crew A, Luis"). When two jobs want the same crew in the
  same week, that column is where you see it.
- **Start and finish dates, both inclusive.** Count workdays, not calendar days: five workdays
  from a Monday finishes that Friday.
- **What each one waits for.** Most of your sequence is finish-to-start: the inspection waits for
  the rough-in, the cover waits for the inspection. Note any lag, such as a day for the inspector
  to come or curing before you cover.
- **Percent complete, updated weekly.** It should agree with what you bill. If the lookahead says
  rough-in is 30% and the pay application bills 60%, the GC will notice.

## Check the sequence

The most common error in a hand-kept schedule is an activity starting before the one it waits
for has finished. Usually it was right once, and then the predecessor moved and this one didn't.
For each activity with a predecessor, the earliest start is the workday after the predecessor
finishes, plus the lag. Anything that starts earlier is out of sequence, and you should fix it
before the meeting, not in it.

## When the GC slips, move everything after it

When the GC's schedule slips (the deck pour moves a week, the framing inspection fails), your
next activity moves, and so does everything that waits on it. In a spreadsheet that means
retyping a column of dates and missing one. Instead, move the first affected activity by a
number of workdays and let everything downstream move by the same amount. Work that is already
done stays where it happened.

Each move is a schedule impact worth recording. Your subcontract's notice clause, not the
lookahead, decides whether you are owed time. Write a dated note of what moved and why, and
cross-check it against your
[daily reports](2026-11-26-construction-daily-reports-for-subcontractors.md) for those days.

## What to bring to the meeting

- The next three weeks of your open activities, with a bar per workday.
- Anything late, shown to today, so it doesn't drop off the sheet because its finish date passed.
- What each activity waits for, so a GC-side constraint (an area not turned over, a missing
  inspection) is visible as the reason, not as your delay.
- The date it was printed.

## In PayApps

Job schedules are now part of PayApps, the pay-application and job-paperwork tool in development
for subcontractors, on every plan:

- activities per job, numbered A-001 onward, with trade or crew, start and finish, percent
  complete, and optionally the activity each waits for and a lag in workdays;
- each activity's status for today (not started, in progress, done, late start, past finish), and
  a flag on any activity that starts before its predecessor finishes, with its earliest start;
- "Move with what follows": one activity and everything downstream of it moved by N workdays (or
  pulled in), with done work left in place and lengths kept;
- the three-week lookahead drawn as bars on the job page, a landscape PDF of it (up to six weeks)
  for the GC's meeting, and the whole schedule as CSV.

Weekends are skipped. Holidays aren't known yet, so check any date that lands on one. Dates are
the ones you type: nothing is scheduled for you.

The product is in early access and nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/).
