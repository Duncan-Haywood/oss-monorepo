---
title: "Monte Carlo schedule risk from a P6 XER file: 47 near-critical activities the driving path hides"
seo_title: "Monte Carlo schedule risk from a P6 XER file"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, critical-path, monte-carlo]
description: "A free browser Monte Carlo on a P6 schedule: P50/P80 finish dates and criticality index, tested on six public XER files. Merge bias with real numbers."
---

A critical path schedule gives one finish date. It does not say how likely
that date is, and it names one driving path when several paths are close
behind it. Schedule-risk products answer both questions with a Monte Carlo run,
and they are sold as per-seat desktop licences. [XER Schedule
Check](https://marisstella.app/xer-schedule-check/) now does the core of it in
a browser tab, on the P6 `.xer` file you already have.

## What it does

Each run draws every open activity's remaining duration from a triangular
range, then recomputes the schedule. The recompute uses the same engine that
matches P6's stored early finish, late finish and total float on 99.9% of
19,822 activities in six public files. After a few hundred runs you get:

- P10, P50, P80 and P90 finish dates;
- the chance of meeting the forecast date and the must-finish date;
- the **criticality index**: the share of runs in which each activity was on
  the driving path;
- sensitivity: how strongly each activity's duration moves the finish.

The file holds one duration per activity, so there is nothing in it to set the
ranges from. The default (90%, 100% and 125% of the remaining duration) is a
placeholder, and the page says so above the result. Paste
`activity ID, optimistic, most likely, pessimistic` lines (in working days)
from the people doing the work to replace it. A correlation setting covers
causes such as weather or crew productivity, which push many activities the
same way at once.

## What six real schedules showed

All numbers come from `eval/risk-check-2026-11-19.md` in the venture's folder:
500 runs per file, seed 1, so anyone can repeat them.

**The sampler uses the engine as checked.** Set every range to zero width and
every run gives the CPM finish to the minute, on all six files.

**Merge bias is real and grows with parallel work.** The default range has a
mean of 105% of each duration, so on a single chain of activities the P50 sits
about 5% late. That is the 30-activity sample file: +7.3 working days on 150.
Files with many parallel paths land later than that skew explains. The hotel
programme's P50 is +55 days on 662 (8.3%), because the finish waits for the
latest of several uncertain paths.

**The single driving path hides near-critical work.** On a 14,000-activity
programme, 22 activities sit on the forecast's driving path. Another 47 drive
the finish in at least 10% of runs. On the hotel file the counts are 79 and
76. Those are the activities a reviewer should ask about, and the CPM output
does not list them.

**Sometimes the answer is "fix the model".** The Expressway file's P50 is +224
days on 1,154. The cause: 23 open activities of exactly 1,095 days
("Maintenance of Engg Off Type 1", "Provision of Survey Equipments"), modelled
as ordinary tasks running in parallel to the finish, not as level of effort.
Put any range on them and the finish becomes the latest of up to 23
three-year draws. The criticality list puts them at the top, which is how you
find this kind of fault.

**One correction made along the way.** The first version ranked activities by
sensitivity. On the 821-activity file at 200 runs, the top five had
correlations near 0.22 but were never on the driving path. That was chance:
with hundreds of activities, some correlate by luck. Sensitivities below
4/√runs now show as blank, and the list is ranked by criticality.

## Limits

The output is only as good as the ranges you give it. It does not model risk
events (a probability and an impact on named activities), resource limits or
probabilistic branches. None of the six files comes with an as-built schedule,
so these runs say nothing about how accurate the P-dates are. Risk-register
events are the next item. This is a screening tool, not scheduling, contractual
or legal advice.

The code is MIT licensed: `ventures/xer-schedule-check/risk.mjs`, about 250
lines. From a terminal, run
`node cli.mjs schedule.xer --risk 1000 --range 90,100,130 --correlation 0.3`.
