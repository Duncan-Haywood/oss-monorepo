---
title: "How P6 handles a lag after a finished activity: only the unspent part comes back"
seo_title: "P6 lag after a finished activity: the unspent part counts"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, critical-path]
description: "A rule found in a public P6 6.0 schedule: a finished activity's lag still counts backwards, but only the hours not yet run at the data date."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes a Primavera
P6 schedule's critical path in the browser and compares the result with the
dates P6 stored in the same `.xer` file. On six public files it already
matched early finish, late finish and total float on 19,820 of 19,822 open
activities ([the method](2026-11-19-reproducing-p6-float-from-an-xer-file.md)).
One set of numbers still did not match: the late dates P6 stores for activities
that are already *finished*.

## Why a finished activity has a late date at all

With retained logic, P6 keeps a completed activity in the network as a
zero-length node at the data date, so logic still flows through it when work
is done out of sequence. P6 gives that node a late date of its own and writes
it to the file. In the heavily progressed CCA programme (P6 6.0, 14,270 open
activities, 1,534 finished nodes with stored late dates), our engine agreed
with 1,497 of them. The other 37 were all later than P6's dates.

## What the 37 had in common

Listing them by successor showed six chains, each copying its error from one
root activity. At each root the gap between P6's late date and a successor's
late start was not random:

| Root | Link | Lag | Worked between actual finish and data date | P6's gap |
|---|---|---|---|---|
| PGLS103391C120 | FS into a finished node | 240 h | 8 h | 232 h |
| G02BM05501C0 | FS into an unstarted activity | 240 h | 8 h | 232 h |
| T20CO05305C0 | FF into a finished node | 48 h | 8 h | 40 h |
| PFNS103304R02 | FS into an unstarted activity | 96 h | 72 h | 24 h |

In every case the gap is the lag minus the working hours that passed between
the activity's actual finish and the data date: the part of the lag **not yet
spent**.

## The rule

Going forwards, a finished activity's lag runs from its actual finish, so a
cure time still delays its successor. Going backwards, the engine used to take
none of that lag off the finished node. That was right for lag that had
already run out by the data date, and it is why an earlier test found "no lag
back" correct. It was wrong for lag that is still running. Two other versions were
tried and measured: taking the whole lag back loses 318 matches, and taking
it back only into unstarted successors loses 231. Taking back the unspent part
fits:

> late date of a finished node = successor's late date − (lag − work from
> actual finish to data date), when that is positive.

With it, finished-node late dates match on **1,529 of 1,534** in the CCA file
(1,550 of 1,555 over all six files), and not one open activity's dates or float
changed. The rule is a switch (`bwDoneLagLeft`) in `cpm.mjs`, so the run without
it can be repeated, and `node eval/cpm-vs-p6.mjs` now prints the finished-node
count for each file.

## What is still unexplained

The five left are one chain. Its root has a start-to-start lag of 312 h,
used up in 2010, into an activity whose late date we compute exactly as P6
does, yet P6 puts the root 118.4 working hours *after* that date. Removing the
link does not reproduce P6 either, so P6 honours it with some offset we have
not found. The details are in
[`eval/cpm-vs-p6-2026-11-19.md`](../../ventures/xer-schedule-check/eval/cpm-vs-p6-2026-11-19.md),
rule 17 and "What is left".

Why it matters: a reviewer who sees a finished activity's late date move
between updates should be able to tell whether the logic or the data changed.
That only works if the tool computes those dates the way P6 does.
