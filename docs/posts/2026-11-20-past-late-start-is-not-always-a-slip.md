---
title: "Past its late start, and nothing moves: reading a constraints log against P6's own float"
seo_title: "Constraints log vs P6 late start: which rows really slip"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, last-planner]
description: "XER Schedule Check now says whether a constraint past its activity's late start moves the finish, sits in calendar slack, or is behind a worse path already."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) merges a site
team's constraints log (permits, deliveries, RFIs, crews) with a Primavera P6
schedule and flags each row whose expected date lands after its activity's
late start. "Past late start" sounds like it means "this will slip the job".
On the public P6 files we test against, about a third of those rows moved
nothing at all. The flag was crying wolf, and a flag that cries wolf gets
ignored.

## Two reasons a late start is not the last safe day

**Calendar slack.** P6's backward pass counts a finish-to-finish lag back
from the successor's late finish, a period end such as Thursday 16:00. If the
successor works on a calendar with Fridays off, it could just as well finish
at Saturday 08:00, so a predecessor on a 7-day curing calendar has the Friday
too. P6 does not credit that day. Two of the hotel file's rows sat in it:
HEMSMCI0020 was expected on 14 June, P6's late start was 13 June 08:00, and
the late start with that slack credited is 14 June 08:00.

**A deadline someone else already misses.** One public file, a large
multi-storey job, carries three finish-on-or-before dates the schedule
already misses, and 552 open activities are on negative float. An activity
there can be past its late start by days and still not move the deadline,
because a longer path misses it by more. 25 of the 26 planted rows past
their late start on that file were of this kind. Before this change they
read exactly like the one row that does push the deadline out.

## What the log says now

Each row past P6's late start is read against two more late starts: one
with the calendar slack credited, and one with each missed deadline moved to
where the schedule already puts it. It is then labelled in words:

- *moves the finish or a deadline*
- *within the slack its calendars leave: moves nothing*
- *a deadline is already missed by more on another path*, with the date
  after which the row starts adding to it

## How it was checked

Logs were planted on the six public P6 files, with three seeds, giving 65
rows past P6's late start. Each row was then run alone through the scheduler
and checked against the project finish and every late-bounding constraint
in the file. The 38 rows labelled as moving something all moved one. The 27
labelled as moving nothing moved nothing. Then each of those (the
single-activity ones, 21 of them) was put one working hour past the date it
was read against, and every one of those then moved something. So the label
is right on these files, and its bound is right to the hour. The full table
is in `eval/constraints-slack-2026-11-20.md`.

The logs are planted, since no public job publishes its constraints log. A
deadline kept outside the schedule, such as a contract date the file does
not carry, is not seen.

## A puzzle left unsolved

The same run went back to the last activity whose dates the engine does not
reproduce. That is one finish milestone on the 14,270-activity file, which P6 put 168
working hours earlier than its own 608 h lag allows. We ruled out six
explanations against the file's own numbers: another lag calendar, holidays,
planned dates, an external link, an edit after the run, and the
predecessor's other link (760 h, counted the normal way). It is one link
with no second case, so it stays recorded as an unexplained P6 date rather
than fitted with a rule.

*Schedule figures are from recomputation of public files and are not a
substitute for a scheduler's or claims consultant's review.*
