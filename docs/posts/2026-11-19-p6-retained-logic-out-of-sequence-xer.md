---
title: "P6 retained logic on out-of-sequence progress: from 88% to 99.4% on a 14,000-activity XER"
seo_title: "How P6 retained logic schedules out-of-sequence progress"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, dcma, critical-path]
description: "Three rules for start-to-start links and finished activities brought a recomputed CPM from 12,582 to 14,181 of 14,270 activities equal to P6's stored dates."
---

Earlier today the [XER schedule check](https://marisstella.app/xer-schedule-check/)
recomputed P6's early dates, late dates and total float for 18,133 of 19,822
open activities in six public XER files
([post](2026-11-19-reproducing-p6-float-from-an-xer-file.md)). Nearly all of
the misses were in one file: a P6 6.0 programme with 14,270 open activities and
2,134 out-of-sequence links, where only 12,582 (88.2%) matched. This run took
that file apart, root by root, and now 14,181 match (99.4%). Across all six
files the count is 19,732 of 19,822 (99.5%), and the other five files did not
lose a single match.

## How the misses were found

A wrong early finish spreads to every successor, so the useful list is the
*roots*: activities whose own early finish is wrong while every predecessor's
is right. There were 82 of them. Grouped by the status of the activity and its
predecessors, 64 had the same shape: an unstarted activity with a
start-to-start link from a **started** predecessor. In the ones read by hand,
P6 had pushed that predecessor's remaining work past the data date because its
own predecessors were not finished yet (retained logic).

## The three rules

1. **SS from started work waits for the remaining work.** The engine counted the
   SS lag from the predecessor's actual start. That date is months in the past,
   so the successor started at the data date. P6 instead starts it no earlier
   than the predecessor's remaining start, with no lag added (the lag was spent
   when the predecessor began). Activity `C04M126011C0`, for example: its SS
   predecessor started in August, but its remaining work cannot start until
   5 December, and P6 starts the successor on 5 December. The engine had said
   1 October. That one rule moved the file from 12,582 to 13,709.
2. **A finished activity placed out of sequence passes its node on.** A
   finished activity whose predecessor is unfinished sits in P6's network as a
   zero-length node at that predecessor's finish. A start-to-start successor
   starts no earlier than the node, again with no lag. The backward pass mirrors
   both rules (to 14,084).
3. **Finished activities get late dates too.** The backward pass had skipped
   them. P6 gives each finished node a late date, the earliest its successors
   allow, and that date limits the late finish of the node's own predecessors
   (to 14,181). The late dates the engine now gives finished nodes equal P6's
   stored ones on 1,175 of 1,534 in this file and 21 of 21 in a P6 24.12 export.
   Before this run it gave them none.

Each rule is a switch in `cpm.mjs`, so the run without it can be repeated, and
each was kept only because the totals rose and no other file lost a match. A
unit test builds a five-activity schedule that exercises all three by hand.

## Why it matters to a reviewer

The tool uses the recomputed schedule for DCMA's critical path test and to list
activities whose stored dates disagree with the logic. On a heavily progressed
schedule, which is exactly the kind a monthly reviewer gets, 1,688 false
"disagrees" would have buried the real ones. Now 89 are left.

## What is left

59 of the 89 have a different late finish. In the cases read by hand, the
cause is a finished successor whose own late date falls before the data date
(negative float on a finished node), where P6's date is 12 to 16 days later than
ours. The other 30 have a different early finish and include odd data, such as
an activity whose actual start comes after its remaining start. Six files from
six sources is still a small sample. A seventh exporter could show a rule none
of these does. Method and every count: `ventures/xer-schedule-check/eval/cpm-vs-p6-2026-11-19.md`.

The tool is free, MIT licensed and runs in the browser. The XER file is not
uploaded. These are screening metrics, not scheduling, contractual or legal
advice. The tool is not affiliated with Oracle, Primavera or the DCMA.
