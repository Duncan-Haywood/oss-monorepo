---
title: "A Gantt chart from a P6 XER, and the level-of-effort dates P6 never explains"
seo_title: "Gantt chart from a Primavera P6 XER file without P6"
date: 2026-11-20
tags: [construction, scheduling, primavera-p6, xer, gantt]
description: "XER Schedule Check now draws a Gantt chart from a P6 XER, with level of effort and WBS summary dates that match P6's on 305 of 305 activities."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser and recomputes its dates (they match what P6
stored on 19,820 of 19,822 activities in six public files). Until today it had
no Gantt chart. A Gantt chart is the first thing anyone opens in P6, and the
one thing an owner's rep, a lender or a subcontractor who receives an XER with
no P6 licence cannot see. The usual answers are a paid XER viewer or asking
the contractor for a PDF of whatever layout they chose.

## What the chart shows

- The WBS as a tree in P6's own order (`seq_num` at each level), with a
  summary bar per node. Click a node to fold or open it, or open the tree to
  a set depth.
- One bar per activity: actual work in grey, remaining work in blue, red when
  critical. "Critical" follows the project's own setting (total float at or
  below its threshold, or longest path), and a switch colours by the longest
  path instead.
- Milestones, the data date line, the must-finish line, and the relationships
  between the rows on screen.
- A search box and a critical-only filter that keep the WBS rows above each
  match.
- With a baseline file (or last month's update), a thin bar for each
  activity's baseline dates and its finish variance in working days on its
  own calendar.

It prints as a landscape page and downloads as a CSV. Nothing is uploaded.

## The part that was not drawing

Two kinds of activity have no duration of their own. A **level of effort**
(LOE) activity, such as site supervision or a project manager's time, runs
from when the work it covers starts to when that work finishes. A **WBS
summary** activity spans everything in its WBS branch. The scheduling engine
leaves both out of the network, because they follow the network and never
drive it. A chart still has to draw them, and a public hospital file has 285
LOEs.

P6 stores the dates it gave them, so every rule could be checked against
P6's own answer. The first rule was the obvious one: start where the
predecessors allow, finish where the successors ask. It matched 243 of 285
starts. Four things it missed:

1. A started LOE resumes at the data date, but only when its predecessors have
   started. One whose start-to-start predecessor has not started yet resumes
   with that predecessor, weeks after the data date.
2. LOEs chain. One file has an LOE that starts 240 hours after another LOE
   starts, so they have to be resolved in turn.
3. When the successors of a started LOE have already finished before the
   date its predecessors give, P6 keeps the data date as its remaining start
   instead of drawing a bar that ends before it begins.
4. A WBS summary spans its whole branch, child nodes included, not just its
   own node. A started one resumes at the data date like any started
   activity.

With those, **305 of 305** span activities on the public files match P6's
stored early start and finish to the minute: 285 LOEs on the hospital file,
10 in a P6 20.12 sample and 10 WBS summaries in a P6 24.12 file.

## The other checks

On the same six files, every activity appears on the chart exactly once
(21,739 of 21,739). Every WBS bar is exactly the span of the work under it,
and the tree follows the WBS order (2,038 of 2,038). For the baseline
comparison, the check made a copy of each file with k days added to one
activity, used that copy as the baseline, and expected a variance of exactly
-k days. That held 117 times out of 120. The other three were right to be 0:
each of those activities had its finish tied by a finish-to-finish
predecessor, so the longer duration moved its start, not its finish. The
sample now leaves such activities out, and every run is exact (120 of 120).
The whole check is in
[`eval/gantt-check-2026-11-20.md`](../../ventures/xer-schedule-check/eval/gantt-check-2026-11-20.md).

What it does not do yet: no public XER comes with a P6 baseline project next
to its update, so the baseline comparison has only been checked on planted
copies. Grouping by activity codes, P6's other main layout, is not there
either.

The tool is free and MIT licensed:
[marisstella.app/xer-schedule-check](https://marisstella.app/xer-schedule-check/).
It gives screening results, not scheduling or legal advice.
