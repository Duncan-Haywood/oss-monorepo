---
title: "Is the schedule getting better or worse? A health trend across P6 updates"
seo_title: "Schedule quality trend across Primavera P6 updates, free"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, dcma]
description: "XER Schedule Check now reads every update of a job at once and shows DCMA points, BEI against the first update and the activities losing float."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads Primavera P6
`.xer` exports in the browser. It could already check one update against the
DCMA 14 points, and it could split a whole job's finish movement into windows.
What it could not answer is the question a lender's monitor or an owner's
scheduler asks every month: is this schedule getting healthier or sicker?

Paid schedule-analytics subscriptions sell that trend. As of today the windows
section of the page gives it for free, from the same files.

## What the trend shows

Open all of a job's updates at once. For each one, in data-date order:

- the DCMA points passed, and each point's pass or fail by update;
- the forecast finish and how far it moved;
- how many open activities sit on zero or negative float, and how many within
  10 working days of it;
- **path kept**: of last month's driving-path activities still open, the share
  still on the driving path. A path that changes every month is one nobody can
  manage to;
- what **newly fails** each point, by activity. That is what got worse this
  month.

## BEI from one file can't see overdue work

The baseline execution index (BEI) compares the work finished with the work
that was due. In a single XER the only "baseline" is P6's planned dates. P6
resets the planned dates of work that has not started to its early dates
every time it schedules. So late work that has not started never counts as
due, and the BEI flatters the schedule.

The trend uses the first update in the series as the baseline instead. An
activity's baseline finish is its finish in that file, and later updates are
measured against it. To check this, six public P6 files were each statused
exactly as planned four times. Against the first update, the BEI reads 1.000
in every update. The single-file BEI on the largest file, a hospital job,
reads 0.662 on the original and climbs to 1.037 on updates that went exactly
to plan. That number tracks how P6 rewrote its own dates, not what got built.

## Float that leaks away

The trend also lists every activity whose float fell across the updates. For
each one it shows the float in each update, the loss per month and the months
until it reaches zero at that rate. These are the activities about to join the
critical path, named before they get there.

Float can fall with nothing late, though. Take an activity that is under way
and whose successors are tied only to its start. P6 sets its late finish from
the successor's late start plus the remaining duration, so the late finish
pulls in as the remaining duration shrinks. On the hotel file one activity
went from 39 days of float to 14 in a series statused exactly to plan, while
its forecast finish never moved. So each row says where the float went: the
activity's own finish moved later, or its late finish was pulled earlier.

With 5-day slips planted on the public files, the slipped driving-path
activity was named as missed in exactly the updates where it was due (15 of
15). An off-path slip was listed as losing float exactly when its float
really fell (9 of 9). The other six times, a finish-to-finish link or a
constraint held the finish, so the slip cost no float. The full check is in
`eval/trend-check-2026-11-22.md`.

## Try it

Open the [tool](https://marisstella.app/xer-schedule-check/#win). You can
load the four-update example series or choose your own updates. Nothing is
uploaded. From a terminal: `node cli.mjs --trend jan.xer feb.xer mar.xer`.

It reads schedules. It doesn't decide who is responsible for a delay, and its
numbers are not legal or contractual advice.
