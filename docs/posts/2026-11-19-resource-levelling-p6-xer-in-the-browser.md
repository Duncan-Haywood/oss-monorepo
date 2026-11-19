---
title: "Resource levelling a P6 schedule from its XER file, and the default limit that makes it run for years"
seo_title: "Resource levelling a Primavera P6 XER file in the browser"
date: 2026-11-19
tags: [construction, scheduling, primavera-p6, resource-levelling, critical-path]
description: "A free browser tool now levels a P6 XER against each resource's max units. On public files it holds every limit and link, and catches P6's default limit."
---

A critical path schedule assumes every crew can be in two places at once. Two
activities with no link between them run side by side, even when both need
the only drywall crew on the job. Resource levelling fixes that: it delays
work until each resource stays within the number of units the schedule says
exist. In Primavera P6 that is the Level Resources command, and you need a P6
seat to run it.

[XER Schedule Check](../../ventures/xer-schedule-check/) now does it from the
`.xer` file in a browser tab. You get the levelled finish, every activity that
moved and the resource that moved it, the peak use of each resource before
and after, and a crew-size box: "what finish do we get with two crews?"

## How it levels

It is a serial levelling pass, the method P6 describes for its own:

1. Recompute the schedule with the same CPM engine that matches P6's stored
   dates on 19,820 of 19,822 activities in six public files.
2. Take the not-started activities that use a resource with a limit (the
   `max_qty_per_hr` in the file's RSRCRATE table) in order of early start.
   Ties go by the file's levelling priority list, then total float.
3. Place each one at the earliest start, on its own calendar, where every
   assignment it holds fits under its resource's limit for the whole
   assignment. Assignments keep their own lag and remaining units.
4. When an activity has to move, hand its new start back to the CPM engine as
   a start floor and recompute. Successors then move by the same logic, lags
   and calendars as any other run. Anything already placed that the
   recompute moved gets placed again.

Started work keeps its dates and counts against the limits. "Level within
float" and the float to keep come from the file's settings.

## How it was checked

No public XER file stores P6's own levelled dates, so a direct comparison
with P6 is not possible yet. What can be checked on real files is that the
result is a valid levelled schedule. Six public P6 exports, four with
resource limits:

- **No placed activity is ever over a limit.** The tool measures the hours
  in which a resource is over its limit while an activity it placed is using
  it. That figure is 0 hours on every resource of every file. The only
  over-allocation left is started work, which is fixed, and activities that
  alone need more than the limit. Those are listed with the reason.
- **Every zero-lag link still holds** in the levelled dates: 37,670 of
  37,670 links between unstarted activities across the six files. This is checked
  by a separate script, not by the engine's own code.
- **Nothing starts earlier** than it did before levelling.
- **The levelling path itself changes nothing.** With every limit multiplied
  by a million, the levelled dates equal the CPM dates on every open activity
  of every file.

The check also found a bug before it passed. On the 14,000-activity CCA
programme the first run left 6,629 hours over a limit. A started activity
that tied on start time with unstarted ones was placed after them, so they
were placed without seeing what it used. Started work is now placed first,
and the figure is 0.

## What it found: the default limit

The interesting result is not in the algorithm. P6 gives every new resource a
maximum of 8 hours a day, which is 1 unit per hour, and many schedulers load
resources for cost or quantity reporting without ever setting a real crew
size. Level against that default and the finish moves by years:

- On the public hotel programme, three labour and equipment resources with
  limits of 1 to 1.5 per hour are used at up to 10.5 at once. Levelled, the
  2014 finish moves to 2021. With limits 4 times higher it moves to 2015.
- On the Expressway file, every labour resource has a limit of 1 per hour and
  is used at up to 43 at once. Levelling runs into the tool's 30-year horizon:
  238 activities would start more than 30 years after the 2015 data date, and
  235 need more than the limit on their own. The CCA programme does the same
  and also loads quantities as resources with the default limit.

So the page warns when a resource still has the default limit of 1 per hour
and is used at least three times over it. It also prints a lower bound that
no levelling can beat: a resource's remaining work divided by its limit. If
that bound is decades away, the file's limits are the thing to fix, not the
schedule.

## Limits

This is a serial pass like P6's, not P6's code, so its levelled dates can
differ from P6's. Usage is measured over each assignment's span, so two
activities on different shift calendars whose spans overlap count as
overlapping even if they never work at the same hour. Resource curves,
overtime and splitting activities are not modelled.

The code is MIT licensed: `level.mjs` in the venture's folder. The checks are
in `eval/level-check.mjs`, and `level.test.mjs` works through small cases by
hand.
