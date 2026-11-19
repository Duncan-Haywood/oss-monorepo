---
title: "P6's longest path rebuilt from the XER: 261 of 261 on five files, and a sixth whose flags contradict its float"
seo_title: "P6 longest path and multiple float paths from an XER file"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, xer]
description: "XER Schedule Check now rebuilds P6's longest path, checks it against the flag P6 stores, and traces multiple float paths to any milestone, in the browser."
---

Every Primavera P6 `.xer` export carries a small piece of P6's own judgment:
a `driving_path_flag` column on each activity, set to `Y` when that activity
sat on the longest path at the last schedule run. A reviewer who receives the
file without a P6 seat can't see that flag, and can't run P6's *multiple float
paths* either. That's the analysis a delay consultant reaches for when the
question is not "what drives the finish" but "what drives the roof being
watertight by March".

[XER Schedule Check](../../ventures/xer-schedule-check/) now does both, in the
browser, and checks the first one against P6's answer.

## The longest path is a tree, not a chain

The tool's old driving path took one predecessor at each step. That's fine
until two branches both drive the finish. In the airport terminal sample,
19 activities were on that single chain, while P6 had flagged 36. The other 17
sit on a second excavation-and-footings branch that finishes at the same
moment.

The new `longestPath()` keeps every driving branch: every open activity from
which a chain of zero-gap links reaches an activity finishing on the project
finish. On the six public P6 files the CPM engine was already checked against:

| File | P6 flagged | Rebuilt | On both |
|---|---|---|---|
| Expressway (P6 7.0) | 33 | 33 | 33 |
| example (P6 24.12) | 17 | 17 | 17 |
| hotel (P6 6.0) | 133 | 133 | 133 |
| sample (P6 20.12) | 42 | 42 | 42 |
| terminal (P6 5.0) | 36 | 36 | 36 |
| CCA (P6 6.0) | 604 | 56 | 56 |

Five files match exactly, with nothing extra. The sixth is the interesting one.

## When the file disagrees with itself

On the CCA programme (14,270 open activities, heavily progressed) all 56
activities rebuilt here are flagged by P6, but P6 flags 548 more. Those 548
can't be on a longest path from the same run that wrote the file's dates. Some
carry up to 3,788 hours of total float *as P6 itself stored it*, and that
stored float agrees with the recomputed float on 14,268 of 14,270 activities.
P6 also flags 399 activities that are already complete.

So the flags are almost certainly left over from an earlier run. Anyone who
filters the file on that column is reading a stale critical path. The page and
the command line now say so: they print how many activities P6 flagged, how
many the logic gives, and the codes P6 flags that the logic doesn't.

## Float paths to any activity

Total float tells you how far an activity can slip before the *project finish*
moves. Ask about an interim milestone and it often can't answer. In the test
suite, an activity feeding a milestone with a day to spare also feeds a long
tail to the finish, so its total float is zero. To the milestone it has 8
hours.

`floatPaths()` computes float *relative to the activity you name*. It runs a
backward pass from that activity alone, using the same link, lag-calendar and
progress rules as the main engine, and measures each predecessor's float on
its own calendar. Path 1 is the driving chain into the target. Each later path
is the next-least-float chain among the activities not yet on one, the way
P6's "free float" option ranks them. On the page, type an activity ID (or
leave it blank for the finish), choose how many paths you want, and download
the CSV.

There's no P6 answer to compare with: none of the six files stores P6's own
float paths (`float_path` is empty in all of them). So the backward pass is
checked by a property instead. Seeded at the finish's late date, it must never
give an activity less float than its total float, and it must give the same
float wherever the finish is what binds. Across 15,240 activities, no total
float was above the bound. On the hotel file it matched on all 4,211. Getting
there took two fixes, both visible in the counts. Summing link gaps across
different calendars broke the property on 831 activities. Subtracting the SS
lag of an activity that had already started (P6 treats that lag as spent) broke
it on 143.

## What's left

A public XER that stores P6's own float path numbers would let the path order
be checked against P6 directly; ties between paths with equal float are
ordered here by the later finish, which may not be P6's rule. The measurement
is in [the eval note](../../ventures/xer-schedule-check/eval/longest-path-2026-11-19.md).

*This is a schedule-screening tool working on your own file, not scheduling,
contractual or legal advice.*
