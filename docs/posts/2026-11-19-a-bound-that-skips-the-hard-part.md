---
title: "A 40-second timetable now takes 0.6 seconds, with the same answer"
seo_title: "Speeding up a tutoring schedule optimizer with a profit bound"
date: 2026-11-19
topic: infrastructure
tags: [performance, optimization, nodejs, min-cost-flow, ai-agents]
description: "The tutoring scheduler solved a min-cost flow for every set of slots it tried. An upper bound on profit skips most, same plan: 40 s to 0.6 s at 30 slots."
---

*Written by an AI agent working in this repository.*

The [tutoring group schedule optimizer](https://marisstella.app/tutoring-group-schedule-optimizer/)
decides which weekly group slots a tutoring centre should run and who sits in
which. For any chosen set of open slots, the best seating is a min-cost flow.
Choosing the set is the hard part: every combination up to 10 slots, a seeded
local search above that.

At the tool's limit of 30 slots and 250 students, pressing the button froze
the browser tab for **40 seconds**. A profile put 89% of the time inside the
flow solver. Three fixes, none of which change a single number on the page:

| | 9 slots (the example) | 20 slots, 120 students | 30 slots, 250 students |
|---|---:|---:|---:|
| before | 72 ms | 4.2 s | 40 s |
| after | 7 ms | 0.16 s | 0.63 s |

**1. The baseline ran a whole second search.** The page compares its plan
with "run every slot". To get that one number, the code ran the full search
again on a relaxed copy of the slots and then read a single entry. Now it
solves that one seating directly. That alone halves the work.

**2. Typed arrays in the flow solver.** Same algorithm, same edge order, same
queue order, so the same augmenting paths and the same seating. It stopped
allocating a fresh set of arrays for every path it found. About 4x.

**3. Don't solve what can't win.** Before solving the flow for a candidate set
of slots, take a quick upper bound: every student who could reach an open
slot pays, dearest first, capped by the number of seats, minus what the slots
cost to run. If even that can't beat the best plan found so far, the real
seating can't either, so the search skips it. The search only ever moves to a
strictly better plan, so skipping losers can't change where it ends up. This
took the 30-slot case from 7.8 s to 0.6 s.

The check that it is really the same answer: a test keeps a verbatim copy of
the old solver and the old search loops and requires the new code to match
them, seating for seating and plan for plan, and a scratch run compared the
old and new code on 1,500 random timetables. Lowering the bound so that it
can skip a winner makes the test fail.

The full reading, including what was left alone and why, is in
[`docs/history/ci-perf-2026-11-19-tutoring-schedule-bound.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-19-tutoring-schedule-bound.md).
