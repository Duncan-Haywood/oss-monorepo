---
title: "What crew limits cost: levelling every run of a schedule risk analysis"
seo_title: "Resource-levelled Monte Carlo schedule risk for Primavera P6"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, risk-analysis, resource-levelling]
description: "XER Schedule Check now levels resources inside every Monte Carlo run and reports, on the same draws, how many days the crew limits add at P80."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
`.xer` export in the browser. It already had two tools that did not work
together. One was a Monte Carlo risk run: it samples every activity's
remaining duration, recomputes the dates and reports P50 and P80 finish dates.
The other levelled resources the way P6's Level Resources does. As of today
the risk run can level resources in every run.

## Why a plain risk run is too hopeful

A critical path schedule assumes any number of activities can run at once.
Say two activities each need the one tower crane. The logic lets them overlap,
and the CPM date counts on it. A plain Monte Carlo run over that network does
the same: when both activities run long in a sampled run, they still overlap,
so the delay to one hides under the other.

Commercial risk tools such as Primavera Risk Analysis and Safran Risk can
level resources in each iteration. Until today this one could level the file
once, or run the risk analysis without levelling, but not both.

## What changed

Pick **Level every run** in the risk section, or add `--levelled` on the
command line. Each run's sampled durations, plus any risk events and drawn
branches, go to the same levelling engine as the Resource levelling section,
with the same crew size and settings. The run's finish is then the levelled
finish. An assignment that covers its whole activity stretches with the
sampled duration at the same rate per hour: the crew stays the same size and
the work takes longer.

Every run is also scheduled **without** levelling, on the same random draws.
The levelled finish minus the unlevelled one, run by run, is what the crew
limits cost. Because both schedules use the same draws, the difference
contains no sampling noise, which it would if you subtracted the results of
two separate risk runs.

The driving path also had to change. In a levelled run, an activity can start
late because the crew it needs is still on another activity. No logic link
explains the date. The tool now follows that wait to the activity that held
the crew. That activity therefore counts in the criticality index, where the
plain path would have ended at the waiting activity.

## What it showed on a public file

The public 24.12 example file has 26 labour resources, all at a limit of 1 per
hour (P6's default for a new resource). The default ranges were 90%, 100% and
125% of each activity's remaining duration, with 100 runs:

| Crew size | P80, unlevelled | P80, levelled | Days the limits add per run (mean) |
|---|---|---|---|
| file's limits | 225.3 | 255.1 | 28.4 |
| x2 | 225.3 | 253.1 | 27.1 |
| x4 | 225.3 | 225.3 | 0.1 (none in 94% of runs) |

Days are working days from the data date. Doubling every crew barely helps,
and only at four times the file's limits do the limits stop costing time. That
is the kind of answer a single levelled date cannot give. With crews of 1 per
hour on a file that uses up to 11 at once, the first thing to fix is the
limits in the file, and the page warns about exactly that.

## How it was checked

- With every limit raised a million-fold, the levelled run equals the plain
  run **exactly**: every percentile and every activity's criticality index, on
  all the public files run. The levelling path adds nothing when nothing is
  over a limit.
- At the file's own limits, no run's levelling leaves a placed activity over a
  limit, and no run finishes earlier levelled than unlevelled.
- Small hand-built schedules check the details: a sampled duration stretches
  the assignment, an activity a branch drops uses no crew, and the path
  crosses a crew wait.

The full numbers are in
[`eval/risk-levelled-2026-11-22.md`](../../ventures/xer-schedule-check/eval/risk-levelled-2026-11-22.md).
The tool has not been compared with a commercial tool's levelled risk run: no
public file carries one. Each run costs as much as one levelling, so a large
file needs fewer runs. Start with 100.

The duration ranges are still your assumption, not data in the file. The
result is a screening estimate, not scheduling or contractual advice.
