---
title: "Shortening a P6 schedule when no single activity can: the cheapest set to speed up together"
seo_title: "Crash a Primavera P6 schedule: cheapest acceleration, free"
date: 2026-11-22
tags: [construction, scheduling, primavera-p6, xer, critical-path]
description: "XER Schedule Check finds the cheapest set of activities to shorten together to pull a P6 finish in. On four of six public schedules it beat drag by far."
---

This morning [XER Schedule Check](../../ventures/xer-schedule-check/) got
[critical path drag](2026-11-22-critical-path-drag-p6-schedule.md): how much
earlier the finish would be if one activity took no time. On the six public P6
files, the main finding was how little drag there is. terminal-building-airport
has 33 activities on its longest path and only one with any drag, worth one
day. The reason is parallel chains of the same length. Shorten one and the
chain next to it holds the finish exactly where it was.

That doesn't mean the job can't be accelerated. It means the activities have to
be shortened **together**. Which ones to pick is a minimum cut: the cheapest set
of activities that every driving chain into the finish passes through.
Kelley and Fulkerson wrote the method down in 1961 as the time-cost trade-off.
It usually lives in textbook spreadsheets that know nothing about P6
calendars, SS and FF links or progress.

## What it does

The new **Find the cheapest acceleration** button (and `--crash` on the
command line) works step by step:

1. Schedule the XER with the tool's P6 engine and take every chain of driving
   relationships into the finish.
2. Build a graph of activity starts and finishes, with each duration costed at
   what a day of acceleration costs for that activity, and find the minimum
   cut by max flow.
3. Shorten everything in the cut by the same working time, reschedule, and
   record what was actually won.
4. Repeat until the target is met, some chain has nothing left to shorten, or
   (if you typed what a day of finish is worth) a day costs more to win than
   it saves.

One detail makes a difference. Time bought at an early step can become
useless after a later one. Say a bridge activity E is shortened first, and the
next cheapest cut is A and D together, which covers every path through E.
Following Phillips and Dessouky (1977), the cut can give E's time back and
refund its cost. On 3,000 random networks of that shape, skipping the give-back
paid more than necessary at 69 of 15,283 steps, up to 19% more. With it, no
step did.

You can paste each activity's limit and cost (`activity_id,
max_shorten_days, cost_per_day`). Without that, every task may lose a quarter
of its remaining duration at a cost of 1 per day, so the cost column counts
activity-days of acceleration.

## Is it right?

On 2,100 random finish-to-start networks, a brute-force oracle tried every
combination of whole-day shortenings. Every one of the 14,212 steps the tool
took cost the least that its gain can cost, and every run reached the most the
oracle could win. The oracle first caught two bugs, both fixed before this
shipped. One: a zero-length milestone finishes at 08:00 the next morning while
a parallel chain finishes at 17:00 the day before. That's the same working
moment with different timestamps, so the cut missed one chain.

## Six real schedules, 20-day target, default limits

| Schedule | Best single drag | Won together | Activity-days bought | Most shortened at once |
|---|---|---|---|---|
| terminal-building-airport | 1 d | 20 d | 53 | 3 |
| hotel-project | 1 d | 13.75 d (as far as 25% goes) | 36 | 5 |
| Expressway | 5 d | 20 d | 250 | 23 |
| CCA (19,822 activities) | 5.65 d | 13 d (as far as 25% goes) | 22 | 3 |
| sample | 5 d | 20 d | 20 | 1 |
| example_xer_file | 3.32 d | 3.32 d | 3.32 | 1 |

Expressway is the interesting one. Its 20 days need 23 parallel fabrication
activities shortened at every step, 250 activity-days for 20 days of finish.
That's useful to know before promising a client three weeks. On every file,
putting the chosen shortenings into a fresh schedule gives exactly the finish
the tool reports.

## What it doesn't know

The public files carry no acceleration rates, so the runs above use the
default limit and unit cost, and real rates would change which cut is
cheapest. The oracle covers finish-to-start networks on one calendar. SS/FF
links, lags and mixed calendars are checked only by the replay and hand cases.
No commercial crashing tool has been compared. Full numbers:
[eval/crash-check-2026-11-22.md](../../ventures/xer-schedule-check/eval/crash-check-2026-11-22.md).

Everything runs in your browser. The schedule is never uploaded. It's an
estimate from the file's logic, not advice on how to run a job.
