---
title: "A free route planner's engine, scored on the 56 Solomon problems: 0.44% from the best known"
seo_title: "A free route planner scored on the Solomon VRPTW benchmark"
date: 2026-11-18
tags: [route-stop-optimizer, algorithms, benchmarks]
description: "Route Stop Optimizer now runs a string-removal routing engine with capacity and time windows: 0.44% mean gap on Solomon, 26 of 56 equal to the best known."
---

Paid route planners for small fleets (Routific, OptimoRoute, Circuit and the
rest) charge per vehicle per month for one thing underneath the map: an
engine that splits a day's stops between drivers, keeps each van under its
load and gets to every customer inside their window. The free
[Route Stop Optimizer](https://marisstella.app/route-stop-optimizer/) did
the easy half of that: an exact order for up to 12 stops and a quick local
search beyond. It had no vehicle capacity, and nobody had measured the
heuristic against anything harder than our own invented days.

It now has a real engine, `vrptw.mjs`, and a measurement.

## The method

The engine is ruin and recreate with adjacent string removal, after
Christiaens and Vanden Berghe's "Slack Induction by String Removals"
(Transportation Science, 2020). Each step removes a few short runs of
consecutive stops from routes near a random customer. It then puts every
removed stop back at its cheapest feasible place, skipping a position now
and then so the search does not always make the same greedy choice.
Simulated annealing decides whether to keep the new plan. A check on
whether an insertion breaks a time window has to be cheap, because it runs
millions of times. Each route keeps two arrays: the earliest time service
can start at each stop, and the latest it can start without breaking any
window after it. With those, the check is two comparisons.

It is about 300 lines of plain JavaScript with no dependencies. The page and
the benchmark run the same file.

## The measurement

The Solomon problems are 56 standard test instances: 100 customers each,
clustered, random or mixed, with tight or wide windows. The best-known
solutions are published route by route. We took the instances and the
CVRPLIB best-known routes from the MIT-licensed
[PyVRP/Instances](https://github.com/PyVRP/Instances) repository and used
the DIMACS rules (distances cut to one decimal, total distance as the
objective).

Before counting any gap, the benchmark re-scores every published route set
with the engine's own checker (windows, capacity, depot hours, each customer
once). All 56 matched their stated cost, so the file reader and the rounding
agree with the published numbers.

Then, one seed and 200,000 iterations per instance, about 14 seconds each:

| family | mean gap to best known | worst |
|---|---|---|
| C1 (clustered, tight windows) | 0.00% | 0.00% |
| C2 (clustered, wide windows) | 1.42% | 6.43% |
| R1 (random, tight) | 0.14% | 0.92% |
| R2 (random, wide) | 0.55% | 1.08% |
| RC1 (mixed, tight) | 0.25% | 1.22% |
| RC2 (mixed, wide) | 0.47% | 1.26% |
| **all 56** | **0.44%** | **6.43%** |

26 of the 56 plans equal the best known and none beat it. All 56 passed the
feasibility check.

The two bad results are C204 and C206. Both finish with four routes where
the best known uses three. Emptying a whole route takes more than the short
runs the ruin step removes, so the search settles on one vehicle too many.
The usual fix is a separate phase that empties the shortest route and
reinserts its stops. That is the next item.

Some honest limits. This is one seed, where papers average ten. The
best-known solutions come from the strongest published methods, and we have
not run one of them beside this engine on the same machine and time budget.
That comparison, with PyVRP, is still to make. Larger instances (200 to
1,000 customers) are untested.

## What changed in the tool

Every plan above 12 stops, or with more than one driver, now also goes
through the engine, warm-started from the old plan. The tool keeps whichever
plan is better on its own score, so the change can only help. On invented
service days, a third of them with customer windows, the engine's plan was
kept on 4 of 20 two-driver 40-stop days, with a mean score cut of 8.65%. On
2 of those days the old search had left stops late and the engine left none.
On balanced eight-driver days it rarely wins, because it minimises drive
time while the tool also weighs the longest day. Putting the tool's own
objective inside the engine is on the list.

The new feature is capacity. Add a load column (boxes, kilograms, gallons)
and a vehicle capacity, and every driver's load stays within it. A stop
that fits no driver's load and windows is named rather than planned late.
Nothing is uploaded; the solve runs in the browser tab.

Method, full table and rerun command:
[eval/solomon-2026-11-18.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/route-stop-optimizer/eval/solomon-2026-11-18.md).
