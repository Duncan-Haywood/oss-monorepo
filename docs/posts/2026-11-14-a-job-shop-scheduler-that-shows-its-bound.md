---
title: "A job shop scheduler that shows its bound, run on all 162 JSPLIB instances"
seo_title: "Free job shop scheduling tool with Gantt chart, benchmarked"
date: 2026-11-14
tags: [job-shop-scheduler, ventures, manufacturing, operations-research, research-algorithms]
description: "A free job shop scheduler with tabu search, a proved bound and a Gantt chart. On 162 JSPLIB instances it matched 66 of 103 recorded optima at 4 s each."
---

A job shop has a handful of machines and a pile of jobs, and each job visits the machines in its own order: saw, then mill, then drill for one part; lathe, then mill for the next. Every morning someone decides what each machine runs next. The usual way is a rule of thumb, like "start the job with the most work left", and it gives a schedule. Nothing tells you how good that schedule is.

The new [job shop scheduler](https://marisstella.app/job-shop-scheduler/) takes each job's routing as a plain table (`job, machine, time`, one operation per line) and returns three things: a schedule, drawn as a Gantt chart; a **lower bound** that no schedule can beat; and the gap between them. When the two meet, or when an exhaustive search on a small shop finishes, the page says the schedule is proved optimal. When they don't, it says "best found" and how far off it could be. It runs in the browser and reads the standard OR-Library, JSPLIB and Taillard files too.

## What it does

The page starts with five dispatch rules, each building an *active* schedule the way Giffler and Thompson described in 1960. It keeps the best and hands it to a tabu search. The search only touches operations on the *critical path*, the chain that sets the finishing time. It swaps the first two or the last two operations of each run on one machine, which is the N5 neighbourhood of Nowicki and Smutnicki (1996). Each swap is scored by Taillard's quick estimate before any work is done. The bound is the larger of the longest job, the busiest machine, and a one-machine bound: give every operation on a machine the job's work before it and after it, and even with interruptions allowed the machine cannot finish sooner (Carlier, 1982). On shops of up to 64 operations, a branch and bound then tries to prove the answer.

On the page's own example, six jobs on four machines, the best dispatch rule gives a makespan of 45. The tabu search finds 38 at once. The bound says 37, and the exact search then proves 38 is the best possible. That 7-unit difference is what the rule of thumb was costing.

## How it did

[JSPLIB](https://github.com/tamy0612/JSPLIB) collects the 162 instances researchers test job shop methods on, from Fisher and Thompson's 6-by-6 of 1963 to Taillard's 100 jobs on 20 machines. `bench/jsplib.mjs` ran every one at the page's default of 4 seconds on one thread and checked every schedule with code separate from the solver.

| JSPLIB, 4 s per instance | Result |
|---|---|
| Same makespan as the recorded optimum | 66 of 103 |
| Proved optimal by this engine | 54 of 162 |
| Mean gap to the recorded optimum or upper bound | 1.01% |
| Below a recorded lower bound (would mean a bug) | 0 |

The easy families are close to solved: ft10 (930) and ft20 (1165) at their optima, Lawrence's la01 to la40 at 30 of 40 with a mean gap of 0.19%. The hard ones are not. Storer, Wu and Vaccari's swv instances average 2.4% off and the worst Taillard instance 4.4%. Published methods get much closer, usually with far longer runs. The point of the page is that it tells you which case you are in. On ta29 the engine's 1627 is below the upper bound JSPLIB records, but that bound is dated and better schedules have been published since, so it is not a new record. On Taillard's ten largest instances it met its own bound, and so proved its schedule optimal, on 9 of 10.

## Limits, and what is next

This is the textbook problem: one machine per operation, fixed times, no setups, no due dates, and the finishing time as the only goal. Real shops need those, and they are next, along with a stronger neighbourhood that moves critical operations to the ends of their blocks and a background worker so long searches don't freeze the tab. The full table is in [`bench/jsplib.md`](../../ventures/job-shop-scheduler/bench/jsplib.md), and the [how it works](https://marisstella.app/job-shop-scheduler/how-it-works.html) page explains each step. Free, MIT licensed, nothing uploaded. It sits beside the [assembly line balancer](https://marisstella.app/assembly-line-balancer/), which does the same kind of job for flow lines.

*Written with AI assistance. Results are planning estimates, not engineering or operations advice.*
