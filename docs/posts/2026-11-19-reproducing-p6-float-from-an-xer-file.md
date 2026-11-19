---
title: "Reproducing Primavera P6's float from an XER file: 18,133 of 19,822 activities, and the rules it took"
seo_title: "Reproducing P6's total float from an XER file"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, dcma, critical-path]
description: "A browser DCMA 14-point check that recomputes the critical path, matched against the dates P6 stored in six public XER files: 91.5% exact, and why."
---

A Primavera P6 schedule travels as an `.xer` file: tab-separated tables of
activities, links, calendars and settings. Owners' reps, lenders' monitors and
subcontractors receive them every month, and many of them have no P6 seat to
open one. The usual quality screen is the DCMA 14-point assessment (missing
logic, leads, lags, hard constraints, high and negative float, long activities,
the critical path test, CPLI, BEI and the rest), and the tools that run it are
mostly paid desktop or subscription products.

[XER Schedule Check](../../ventures/xer-schedule-check/) is a free page that
runs the 14 points in the browser and lists the exact activities behind each
failing one. Two of the points cannot be done by reading the file alone. The
critical path test delays an activity on the longest path and asks whether the
project finish moves, which needs a full critical path recompute; and a
reviewer wants to know whether the float stored in the file still follows from
its logic. So the page carries its own CPM engine, and the useful question is
whether that engine computes what P6 computes.

## The check

Every XER stores, per activity, the early and late dates and total float that
P6 wrote at its last schedule run. Six public XER files (from four GitHub
repositories, exported from P6 5.0, 6.0, 7.0, 20.12 and the 24.12 web client;
19,822 open activities) give a direct test: recompute, and count the activities
where early finish, late finish and total float all equal P6's to the minute.

| File | Open activities | All three equal |
|---|---|---|
| Expressway (7.0) | 823 | 823 |
| Hotel, 4 projects (6.0) | 4,217 | 4,216 |
| Example (24.12 web) | 404 | 404 |
| Terminal building (5.0) | 66 | 66 |
| Sample (20.12) | 42 | 42 |
| CCA programme (6.0) | 14,270 | 12,582 |
| **Total** | **19,822** | **18,133 (91.5%)** |

## What it took

The first pass, a textbook forward and backward pass on each activity's own
calendar, matched 10,701 activities. Each rule below came from one
mismatch traced back to the first activity that went wrong, and was kept only
if the totals went up:

- **Planned start.** An unstarted activity never starts before the project's
  planned start, even when the data date is two weeks earlier. One rule: 0 to
  823 of 823 on the Expressway file.
- **As late as possible.** The constraint spends the activity's free float,
  worked from the last activity back so a chain of them moves together.
- **Milestones across calendars.** A finish milestone on an 08:00-16:00
  calendar after a predecessor finishing at 17:00 on another calendar lands at
  08:00 next morning, not at 16:00 the same day, which would be before its
  predecessor finished.
- **Completed activities stay in the network.** P6 keeps a finished activity as
  a zero-length node at the data date. If an unfinished predecessor (progress
  out of sequence) pushes it, the push carries on to its successors. A
  finished predecessor's lag still runs from its actual finish: a seven-day cure
  after a pour finished yesterday still holds the next activity.
- **Start-to-start links into started work.** A started activity's remaining
  work waits for a start-to-start predecessor's remaining work. If that
  predecessor has started, the lag is already used up; if not, the lag still
  applies. The backward pass mirrors this rule.

On the large programme those last two rules took the count from 10,190 to
12,582. The 1,688 activities still off all sit among its 2,134 out-of-sequence
links. They are started activities with a mix of finish-to-start and
start-to-start predecessors that are also started, where P6's retained-logic
rule is not yet reproduced. The full trail, with the count after each rule, is
in [the eval note](../../ventures/xer-schedule-check/eval/cpm-vs-p6-2026-11-19.md).

## What the 14 points found

None of the six files passes all fourteen. The lightest schedule (52
activities) fails only on relationship types (57% finish-to-start, against a
90% floor) and resources. The 16,000-activity programme passes five. 62% of its
open activities carry more than 44 working days of float, it has 544 with
negative float, and 2,134 links were progressed out of sequence. Those numbers
are not a verdict on the projects. The points are screening metrics, and some
failures have good reasons. The value is in the lists: a contractor can be sent
the 105 Expressway activities missing a predecessor or a successor (59 with no successor), not just "fails point 1".

The page is free, MIT licensed and nothing is uploaded. The next step is the
residual retained-logic rule, then an update-to-update comparison (what moved,
which float was used up, which logic changed), the question a monthly
pay-application review asks.
