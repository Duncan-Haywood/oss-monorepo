---
title: "The last two activities our engine could not match in a 16,000-activity P6 file trace back to one edited lag"
seo_title: "Spotting P6 lags edited after the last schedule run"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer]
description: "How XER Schedule Check found the edited 608-hour lag behind its last two misses on a 16,000-activity P6 file, and now names such links in any XER."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a Primavera
P6 schedule from its `.xer` export and compares the result with the dates P6
stored. On six public P6 exports it agreed with P6 on 19,820 of 19,822 open
activities. The two misses were both in one large programme, a
16,000-activity file exported from P6 6.0. Earlier runs had tried every
calendar and start point they could think of and none reproduced P6's dates.

## The two misses

The pair is a finish milestone, *Steel Staircase Fab. & Delivery (Stair 23)*,
and the installation after it. The milestone's predecessor is another
milestone that finished on 31 July 2011, linked finish-to-start with a lag of
608 hours (76 working days). Counted on the predecessor's calendar, 608 hours
from 31 July lands on 29 October. That is the engine's date. P6 stored
5 October.

Today's run asked the question the other way round: how much lag do P6's
stored dates leave room for? Between the actual finish and the stored
milestone date there are **exactly 440 working hours, or 55 days of 8 hours**.
That is a round number of days, not a date P6 could reach by any calendar
rule. And P6 never leaves a link broken when it schedules. So the lag was 440
hours when P6 last scheduled the file. Someone then changed it to 608, or
moved the predecessor's actual finish, and exported without pressing F9.

Reschedule with 440 hours and the installation activity agrees with P6 to the
minute. The milestone agrees too, apart from an overnight gap: P6 wrote 08:00
the next working day, the engine 17:00 the evening before, with no working
time between the two.

## A check for every file

That finding became a check. For every link into an activity that has not
started, the tool tests two things against the stored dates:

- **the early side.** The successor's stored start must be at least the lag
  after the predecessor's actual date, or after its stored early date if it
  has not finished. For FF and SF links the test uses the stored finish.
- **the late side.** The predecessor's stored late date must be at least the
  lag before the successor's. This is the side that catches a longer lag on a
  link with slack. That kind of edit moves no early date, but it still eats
  the predecessor's float.

Any link the stored dates break goes on a new list, *Lags edited after the
last schedule run*, with the lag the dates leave room for. The tool then
reschedules with those lags and counts how many of the stored-date
differences that explains. The written review turns the list into a medium
correction: reschedule and resubmit.

## How it was checked

As found, on seven public P6 files from P6 5.0 to 24.12 (46,727 links into
unstarted activities), the stored dates break exactly one link: the 608-hour
one above. On every other file the list is empty.

The planted test used each file as P6 last scheduled it. Ten runs each
lengthened five random links by 1 to 20 working days without rescheduling:

- 350 planted lags. 280 moved a stored date; the other 70 fit in slack the
  link already had, so nothing could see them;
- **280 of 280 found, 0 extra**;
- 7,552 stored-date differences caused, **7,552 explained**.

The first version checked only the early side. In a smaller trial it missed 5
of 38 planted lags that moved a date, because each one had only eaten float.
Adding the late side found all five. The method and every number are in
[`eval/edited-lags-2026-11-19.md`](../../ventures/xer-schedule-check/eval/edited-lags-2026-11-19.md).

## What it cannot see

A *shortened* lag breaks nothing. The stored dates still satisfy it, just with
room to spare, so this check cannot name it; it shows up only as stored dates
that differ. A link whose predecessor is in progress and counts its lag from
its start is skipped, because part of that lag is already spent. A stored date
typed by hand can also break a link. The check names that link too, and says
the dates break it even with no lag, rather than guessing at a lag.

The tool runs in the browser and the file never leaves your computer. It
screens a schedule; it does not replace a qualified scheduler's review.
