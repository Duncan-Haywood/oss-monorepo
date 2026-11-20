---
title: "Time impact analysis from a P6 XER: a fragnet, a recomputed finish, and where the delay hides"
seo_title: "Time impact analysis (fragnet) from a Primavera P6 XER file"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, delay-analysis]
description: "XER Schedule Check now runs a time impact analysis: insert a delay event's fragnet into a P6 update, recompute, and see the finish, milestones and float move."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser. Its recomputed dates match the ones P6 stored on
19,820 of 19,822 activities in six public files. As of today it also runs a
**time impact analysis**, the method most contracts name for asking for (or
granting) more time.

## What a time impact analysis is

Something happens that the contractor did not plan for: the owner changes the
mechanical layout, a permit is held, the door hardware approval comes back a
month late. The contractor wants an extension of time. The usual way to show
how much (AACE International Recommended Practice 52R-06) is:

1. take the schedule update in force when the event happened;
2. write the event as a **fragnet**: the new activities it added, how long
   each takes, what each follows and what each holds up;
3. insert it, reschedule, and compare the finish with and without it.

Done by hand that is an afternoon in P6 per event, for someone who holds a P6
seat. Claims consultants charge by the hour for it. The owner's reviewer, who
usually has the XER but not P6, has to take the result on trust.

## What the tool does

The fragnet is a small table, pasted from a spreadsheet:

```
Activity ID,Name,Duration,Predecessors,Successors,Not before,Event
F100,Owner change notice: level 2 MEP layout,0,A1030,,2026-04-08,CO-03 MEP layout
F110,Redesign level 2 MEP rough-in,12,F100,F120,,CO-03 MEP layout
F120,Re-approve level 2 MEP drawings,5,F110,A1100,,CO-03 MEP layout
A1040,,+25,,,,Late hardware approval
```

Links read as `A1030`, `A1030 SS` or `F110 FS+2` (lags in working days).
`+25` on an existing activity makes it 25 days longer. The rows go into a copy
of the XER's tables the way a scheduler would type them into P6: a new
activity on the calendar of the work it follows, the event date as a
start-on-or-after constraint, lags on the project's lag calendar. The same
engine then schedules the copy, and the page reports:

- how far the **finish** and every open **milestone** move, in working days
  of the project calendar;
- the **float** every other activity gives up, and which become critical;
- the driving path after the event, and whether the fragnet is on it;
- with two or more named events, **each event alone**. On the example office
  fit-out, the change order alone moves the finish 3 days and the late
  hardware 9, but together only 9: the change order's delay sits under the
  hardware's, which is what concurrency looks like in numbers.

It writes a printable exhibit for the request, a CSV, and the **impacted XER**
itself, so the reviewer can import it into P6, press F9 and see the same
dates.

## How it was checked

No public job publishes its fragnets, so they were planted on the six public
P6 files, each result against an answer reached another way
(`eval/tia-check-2026-11-20.md`):

| Check | Agree |
|---|---|
| A zero-day fragnet between linked activities moves nothing | 120 / 120 |
| A new activity between A and its only successor = A made longer (finish, every milestone, the successor's start) | 115 / 115 |
| The impacted XER, written and read back, schedules to the same finish | 115 / 115 |
| An activity made d days longer moves the finish by d minus its float relative to the finish | 112 / 120 |

Of the 8 that did not, 7 run through activities on a calendar with different
working days, where the delay crosses a non-work day the project calendar
counts differently (a finish 7 days later for 6 added, 17.5 for 18.5), and the
eighth is the expected-finish case below. The CCA hospital file has 16,000
activities and takes about 1.5 s per fragnet.

## Where a delay hides

The planted checks found places where adding days to an activity moves
nothing, all of them P6 behaving as designed:

- **A milestone has no duration.** P6 schedules it as an instant whatever
  the hours field says, so "+5 days" typed on a milestone vanishes. The tool
  now refuses it and says to insert a fragnet activity before the milestone.
- **Expected finish dates absorb delay.** With "use expected end dates" on,
  P6 shortens an activity's remaining duration so it still finishes on its
  expected date. On the public P6 24.12 file, 31 days added upstream of
  activity A10590 moved the finish by zero: A10590 started about six weeks later and
  finished on the same day. A time impact analysis on that schedule shows no
  delay unless someone notices. The tool now names every activity that did
  this, and a switch runs both schedules without expected finish dates.

- **Start-to-start successors do not wait for the finish.** On the public
  airport terminal file, three footing activities are linked to what follows
  only start-to-start. 39 days added to one of them moved the finish by
  zero, which is right: nothing after it waits for it to end. If the delay
  does hold the follow-on work up, the schedule is missing a link, and the
  tool says so.
- **A finish-to-finish predecessor holds the finish.** An activity whose
  finish is tied by an FF link starts *earlier* when made longer, so its
  finish does not move. The tool warns when a row does that.

The same run caught a plain bug: an activity ID ending in "-1" (A10390-1) was
read as A10390 with a one-day lead, which closed a logic loop. An ID that the
schedule or the fragnet holds is now taken whole.

## Limits

It models the delay with the schedule's own logic. Who caused it, whether time
is due under the contract, and how concurrent delay is apportioned are for the
parties and their contract. It works on one update (a prospective or
contemporaneous TIA); for what actually happened across a job's updates, the
same tool's [windows analysis](2026-11-19-windows-delay-analysis-p6-xer-updates.md)
is the retrospective method. Not legal, contractual or scheduling advice.
