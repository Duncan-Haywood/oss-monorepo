---
title: "Risk register events in a free P6 Monte Carlo: probability times impact, and the contingency they ask for"
seo_title: "Risk register events in a free P6 Monte Carlo"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, schedule-risk, monte-carlo]
description: "The browser XER checker's Monte Carlo now takes a risk register: events with a probability and a delay on named activities, the P80 they add, and a ranking."
---

The [XER Schedule Check](https://marisstella.app/xer-schedule-check/) got a
Monte Carlo risk run earlier today: every open activity's remaining duration is
drawn from a range, the schedule is recomputed hundreds of times with the same
engine that matches Primavera P6's dates on 19,820 of 19,822 activities, and
out come P50 and P80 finish dates and a criticality index.

Duration ranges cover the ordinary spread of work. They do not cover the
things a project's risk register lists: the permit that may come late, the
ground that may need rework, the supplier who may slip. Those are discrete. They
either happen or they do not, and when they happen they hit particular
activities. The paid schedule-risk products model them as **risk events**, and
now this free one does too.

## What you type

One line per event:

```
R1 ground conditions, 30%, 5, 10, 20, A1020, A1030
R2 permit,            0.15, 10, 15, 30, A1000
```

That is an ID, a probability, an optimistic, most likely and pessimistic delay
in working days, and the activity IDs it hits. In each run the event happens
with its probability; if it does, one delay is drawn from the triangle and
added to the remaining duration of every activity it names. One draw per event,
so a shared cause delays all of its activities by the same days, each on its own
calendar. Paste the lines into the page's "Risk register" box, or pass a file
with `node cli.mjs schedule.xer --risk 1000 --risks register.csv`.

## Two answers a register should give

**How much contingency does the register ask for?** Every run is scheduled
twice with the same duration draws: once with the events, once without. The
gap between the two P80 dates is the contingency the events add, and because
both columns share every duration draw (common random numbers), that gap is not
blurred by the sampling noise of two separate runs. A register also never
changes the duration draws themselves: the events take their random numbers
from a separate seeded stream, so the "without" column equals a run with no
register to the minute.

**Which event matters most?** Each event gets a finish shift: the mean finish
of the runs where it happened minus the mean of the runs where it did not.
Other events and the duration draws add noise to that gap, so a shift within
two standard errors is marked as not told apart from noise. Events are ranked by
how often they happened times their shift, so a likely small risk and a rare
large one land in the order their expected effect puts them.

## Checked on six real files

The six public XER files the engine was matched against (P6 5.0 to 24.12, up to
14,270 open activities) were used for two checks, written up in
`eval/risk-register-check-2026-11-19.md`:

- **Planted events.** On each file up to 40 activities, picked by a seeded
  draw, got a certain event with a fixed delay of 1 to 40 days. All 207 gave,
  in every run, the finish to the minute that the CPM engine gives with the same
  delay applied directly.
- **The clean comparison.** On all six files the register's "without the
  events" column equals a run with no register exactly.

One planted result is worth knowing for anyone who reads total float. In the
P6 24.12 example file, 6 of 36 delays that were shorter than the activity's
total float still moved the forecast finish, by up to 7.9 calendar days. That is not an
engine error: the project has a must-finish date 10 calendar days after its
forecast, and P6 measures total float against the must-finish date, so the
float includes that margin. None of the six moved the finish past the
must-finish date. When a project's must-finish date is later than its forecast,
an activity's total float is slack to the latest allowed finish, not slack to
the forecast.

With an illustrative three-event register (the files carry no real one), the
events added 3.6 to 11.0 working days at P80. The ranking behaved as a review
would want: a 30% event of 5 to 20 days on the first activity of the driving
path moved the finish by 6.9 to 18.0 days when it happened, while a 50% event
on an activity with one to 33 days of float was marked as noise on every file.
On the Expressway file, whose spread is very wide, even a 15% event on the
path's longest activity could not be told apart from noise in 300 runs, which is what the noise mark is for.

## What it still does not do

The files carry no risk register, so the three-event register in the check is
illustrative, not a forecast. Probabilistic branches (an event that adds new
activities rather than delaying existing ones), resource limits and a risk
section in the written review are not modelled yet. The ranges and the register
are the user's judgment; the tool is only as good as they are.

The code is MIT licensed and runs in the browser; the file never leaves it.
This is a screening tool, not scheduling, contractual or legal advice.
