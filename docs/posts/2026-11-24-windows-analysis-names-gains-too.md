---
title: "A windows delay analysis that names the recovery, not only the delay"
date: 2026-11-24
tags: [construction, scheduling, primavera-p6, xer, delay-claims]
description: "XER Schedule Check's windows analysis was tested on nine more kinds of schedule change. It found gains went unnamed; now 80 of 80 planted changes are named."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) runs a windows
delay analysis over a job's P6 updates. Every window between two data dates
gets the finish movement, split by a half-step run into what progress did
and what the scheduler's revisions did, plus a list of the driving-path
activities behind it. The first check of that analysis (19 November)
planted three kinds of change, and all three were delays: a slip, a lag and
a longer duration.

Real updates hold more than that, so this run planted nine more kinds, one
per window, on series built from six public P6 files:

- **progress:** a late start, a gain (work going faster than forecast), an
  early finish;
- **revisions:** a start-on-or-after constraint, an inserted activity, a
  deleted link, a link retyped from FS to SS, a calendar swap, a duration cut.

The expected answer for each window comes from counterfactual files: the
same update with only its progress, then with its revision added.

## What it found

The split held from the start. Every planted window was on the right side
and split exactly. The naming had two gaps:

1. **Gains were never named (0 of 9).** When work on the driving path went
   faster than forecast and pulled the finish in, the window's numbers were
   right but its driver list was empty, because it only collected work whose
   forecast finish moved *later*. In a claim, the recovery is half the story:
   an owner's reviewer wants to see which work bought back time as much as
   which work lost it. Gains are now listed ("forecast finish ... -3 working
   days, ahead of the forecast"). They are kept out of the "named in the most
   windows" list, which is meant to show where the job lost time.
2. **A deleted link that pulled the finish in 2.9 days went unnamed.** In the
   same window, progress had moved the driving path, so the link was on
   neither the path at the start of the window nor the path at the end.
   Revisions act on the half-step schedule (this period's progress in, the
   revisions not yet), so a revision is now also named when it touches that
   schedule's driving path.

After both fixes: **80 of 80 planted windows split exactly, sit on the
right side and are named.** The original 144-window check is unchanged.

## One more thing it turned up

Finishing out-of-sequence work early (work that started before its FS
predecessor finished) moved one file's finish 19.4 days *later*. The
completed activity stays behind its unfinished predecessor, and its
start-to-start successors follow it. That comes from out-of-sequence
progress, not from the windows analysis, so the check now plants early
finishes on in-sequence work only. We have not checked whether P6 itself
moves the finish the same way.

## Limits

Each series is one real file statused forward with known changes planted.
No public series of real consecutive updates exists. Each window holds one
change, while a real window holds many. The expected split comes from the
tool's own CPM engine, which matches P6's stored dates on 19,820 of 19,822
open activities in the same files, so this tests the split and the naming,
not P6. The full method and every row are in
[eval/windows-kinds-check-2026-11-24.md](../../ventures/xer-schedule-check/eval/windows-kinds-check-2026-11-24.md).
