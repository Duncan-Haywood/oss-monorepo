---
title: "Two lag rules P6 applies to progressed work: 89 mismatched activities down to 14"
seo_title: "Two P6 lag rules for progressed schedules"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, critical-path]
description: "How P6 treats a lag after a finished activity and an SS lag only partly spent at the data date, found by matching 14,270 activities in a public XER file."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) recomputes the early
and late dates and total float of a Primavera P6 schedule in the browser, then
checks the result against the values P6 itself stored in the file. Earlier today
it matched 19,732 of 19,822 open activities in six public XER files. All 90 that
missed but one were in a single file: a heavily progressed programme of 14,270
open activities with 2,134 out-of-sequence links, saved by P6 6.0 with a data
date of 30 September 2011.

Two more rules close most of that gap. It now matches **19,807 of 19,822
(99.9%)**, and the progressed file **14,256 of 14,270**. The other five files
did not change.

## A finished activity does not take its lag back

The engine treats a finished activity as a zero-length node, so logic still
flows through it. Going forward, a lag after a finished activity still counts
from its actual finish: if concrete finished pouring on Monday and the link to
stripping carries 7 days of cure time, stripping waits.

Going backward, we had mirrored that. The node's late date was the successor's
late start less the lag. P6 does not do this. In the file, a chain of finished
activities all sat 14 days earlier than P6's stored late dates. Followed
downstream, the chain ended at one finished activity with a 168-hour FS lag into
a started one. P6 had put the finished node exactly at that activity's late
start, lag and all ignored. An FF link with a 112-hour lag behaved the same way.

Taking the lag off every link type out of a finished node moved 49 open
activities into agreement. It also fixed 318 of the 359 finished nodes whose
late dates had differed.

## An SS lag that is only partly spent

A start-to-start link with a 192-hour lag runs from a started activity. By the
data date, 176 of those hours have already been worked. But the predecessor's
remaining work cannot resume until 1 October at 14:36, because an unfinished
predecessor of its own holds it. When does the successor start?

The engine used to take the later of two dates: where the predecessor's
remaining work starts, and the actual start plus the full lag. That gave 3
October at 08:00. P6 stored 14:36 that day: the 16 hours of lag still unspent at
the data date, counted from where the remaining work starts. With that rule, a
chain of 26 activities agrees. I also tried the same rule in the backward pass.
It changed nothing in any file, so I left it out.

## What is left

There are 14 activities in the progressed file. Ten are late finishes on three
chains, where P6's dates are 3 to 20 days earlier than ours, which means some
bound P6 applies is still missing here. Four are early finishes. Each new rule
is a switch in the engine, so the run without it can be repeated. The full list
and the ablation are in
[`eval/cpm-vs-p6-2026-11-19.md`](../../ventures/xer-schedule-check/eval/cpm-vs-p6-2026-11-19.md).

The sample is still six files from six sources. The next exporter could show a
rule none of them does.
