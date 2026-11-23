---
title: "As-planned vs as-built from two P6 files, with a critical path nobody picked by eye"
seo_title: "As-planned vs as-built schedule analysis from P6 XER files, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, delay-analysis]
description: "XER Schedule Check now lays a P6 baseline beside the as-built and splits the delay into steps along the as-built critical path that add up exactly."
---

Most construction delay claims open with the same exhibit: the plan beside
what happened. AACE International's Recommended Practice 29R-03 calls it the
observational, static method (MIP 3.1 for the whole job, 3.2 period by
period). It is the cheapest method and the easiest to explain, and it is also
where the arguments start, because someone has to say which chain of
activities drove the actual finish, and that is usually picked by eye from a
printout.

[XER Schedule Check](../../ventures/xer-schedule-check/) now does it from two
`.xer` files in the browser: open the final update, then the baseline, and
press **Compare plan with as-built**.

## The path comes from the dates

The tool already builds an as-built model for its collapsed as-built analysis:
a CPM schedule that lands every activity on its actual dates with the file's
own logic (on the six public P6 files it is tested on, 21,404 of 21,422
activities). The as-built critical path is the chain of links in that model
that leaves no slack into the actual finish. Nobody chooses it, and the page
says how many activities the model put on their real dates, so a reader can
see what the path rests on.

## The delay, split into steps that add up

Walking that path from its first activity to the last, the gap between plan
and record can only grow in two places: between an activity and the one that
drove it (a late start) or inside an activity (it took longer). A negative
step is time made up, or slack the plan had between two activities used up.
Each step is a difference of variances, so they telescope: together with the
float the plan gave the last activity on the path, they add up to the
project's delay exactly. On the built-in example, an invented office fit-out
15 working days late:

| Activity | Step | Working days |
|---|---|---|
| A1110 in-wall inspection | late start: the city's date, three weeks after the plan's | +14 |
| A1180 furniture install (owner) | late start | +5 |
| A1150 paint | shorter duration | -2 |
| | float the plan gave the last activity | -2 |
| | **sum, equal to the delay** | **+15** |

Twenty of its 22 activities finished late, and door procurement ran 10 days
long, but none of that is on the as-built critical path. Which of the many late
activities to look at is the useful answer.

## What had to be fixed before the numbers held

The check finishes each public file as planned with the tool's own status
engine, with and without planted delays, so the right answer is known:
built exactly to plan, all six files show no delay and no step; with 60
planted slips (1 to 3 activities, 1 to 30 working days), every step that grew
the delay was on a slipped activity 59 times (the miss is a tenth of a day on
the hotel file), and the steps added up to the delay 60 times of 60; of 60
planted waits, the 25 that landed on the as-built critical path each measured
exactly their planted days. A second seed on five files: 50 of 50 and 50 of
50. The first run was 57 of 60 and 58 of 60.

Four rules came out of the misses, each now in the code with the case that
found it:

- **Calendars.** Measured on the project calendar, a tight link between a
  six-day predecessor and a Sunday-to-Thursday milestone read as a day's late
  start, and a crew working 08:00 to 17:00 that started at 16:00 read as a
  longer duration. Steps are now measured on the activity's own calendar, and
  the remainder is shown as a separate calendar step.
- **Finish-to-finish links.** An activity whose finish an FF link held is
  driven at its finish; the walk now takes that link over a tight SS link, and
  names the predecessor when an FF link explains a longer duration.
- **Ties.** Of several tight links, the walk takes the predecessor that slipped
  most against the plan: the chain that pushed, not one that kept pace.
- **As late as possible.** An ALAP activity is placed by its successor, so it
  never drives one, and no link into it is ever tight. The walk passes over
  ALAP predecessors, and through an ALAP activity follows the predecessor with
  least slack. On the hotel file, the plain driving-path walk stopped at an
  ALAP finish milestone after one activity; the tool now tries every activity
  finishing on the finish date and keeps the longest chain (79 activities).

## Limits

It measures where the delay sits, not why, and not who is responsible. The
planted delays were made by the tool itself, so this checks the method against
a known answer, not against a consultant's exhibit on a real claim; a real
baseline and final update, with the claim's own delay list, is the next test.
Without a baseline file the final file's own Planned Start and Planned Finish
stand in, which P6 resets whenever planned dates are reset, and the page says
so.

There is a step-by-step guide:
[how to run an as-planned vs as-built schedule analysis](../../ventures/xer-schedule-check/how-to-run-an-as-planned-vs-as-built-schedule-analysis.html).
