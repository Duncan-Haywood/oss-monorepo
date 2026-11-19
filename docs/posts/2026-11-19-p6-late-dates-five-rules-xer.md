---
title: "Five more P6 scheduling rules: 14 mismatched activities down to 2 of 19,822"
seo_title: "Five more P6 rules found in a progressed XER"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, critical-path]
description: "Five rules Primavera P6 applies to progressed work, from lags into finished activities to a labour row's leftover hours, found on 14,270 public activities."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a Primavera
P6 schedule in the browser and checks its dates against the ones P6 stored in
the same file. This morning it matched early finish, late finish and total float
on 19,808 of 19,822 open activities in six public XER files. All 14 misses were
in one file: a 14,270-activity programme saved by P6 6.0 with a data date of 30
September 2011 and 2,134 out-of-sequence links.

Five more rules take it to **19,820 of 19,822**. Late finish now matches on all
19,822. The other five files did not change. Each rule came from one
mismatch, and we kept a rule only if the total went up. Each one can be switched
off to repeat the run without it
([method and every count](../../ventures/xer-schedule-check/eval/cpm-vs-p6-2026-11-19.md)).

## 1. A lag into a finished activity comes back off

Earlier we found that a finished activity takes no lag back from its
successors. Turning the link around gives a different result. When an *open*
activity feeds a finished one with an FS lag of 120 hours, the forward pass
pushes the finished node to the open activity's finish plus 120 hours. P6
mirrors that going back: the open activity's late finish was exactly 120 hours
of work before the node's late date. That fixed a chain of five activities that
P6 had 20 days earlier than we did. Doing the same for SS and FF links lost 31
matches, so the rule is FS only.

## 2. A labour row's leftover hours set the late start

Two started activities had no remaining duration, yet P6 stored a late start
weeks before their late finish: 448.8 hours on one, 239 on the other. The
number is in the resource assignments. Each has a labour row whose remaining
work runs from `restart_date` to `reend_date`, and that span is exactly 448.8
and 239 working hours. P6 rolls the assignment's late dates up to the activity,
so in the backward pass the activity behaves as if that work were left. Its
early dates still use a duration of zero. This fixed three activities,
including one whose late finish P6 had 36 days later than we did.

## 3. Unspent SS lag counts going back as well

Take a start-to-start lag of 96 hours from an activity that started 28 working
hours before the data date. The successor still waits for the other 68 hours,
counted from where the remaining work starts. We already did this going
forward. Going back, P6 does the same when the successor is a finished node:
the predecessor's late start is 68 hours before the node's late date.

## 4. As late as possible also applies to started work

An activity with an as-late-as-possible constraint and 9.6 hours left had its
remaining work moved up against its successor's start. We had applied that
constraint only to activities that had not started. The actual start stays
where it was.

## 5. An actual start after the data date has spent no lag

One activity in the file records an actual start in August 2012, almost a year
after the data date, which is a data error that P6 accepts. Its successors
behaved as if none of their 96-hour SS lag had run. Treating every started
predecessor this way lost 9 matches, so the rule covers only an actual start
later than the data date.

## The two left

A finish milestone and its successor still differ. P6 puts the milestone 24
days earlier than we do. Its predecessor is a finished milestone with a 608-hour
FS lag from an actual finish on 31 July 2011. On the predecessor's calendar
that lands on 29 October. P6 stored 5 October, which is 440 working hours after
the actual finish or 32 after the data date. We tried the target finish, the
data date, the 7-day calendar and a 24-hour clock, and none of them comes to
608 hours. We are leaving it as an open question rather than adding a rule
that fits one activity.

Six files from six sources is still a small sample, and a seventh exporter
could show a rule none of these does. If you have a progressed XER you can
share, run it through the tool. The check runs entirely in your browser.
