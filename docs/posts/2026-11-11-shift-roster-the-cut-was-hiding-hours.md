---
title: "The shift cut was hiding spare hours: pricing a one-hour peak"
seo_title: "Minimum shift length vs staffing a peak hour: a cost rule tested on real bakery sales"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A free shift planner scored its staffing before cutting it into shifts. Scored after the cut, the four-hour minimum shift added up to twice the spare hours. A cost-aware cut fixes most of it."
---

Earlier today the free [shift roster builder](../../ventures/shift-roster-builder/)
learned to staff each hour for a share of its past days instead of the average
([post](2026-11-11-shift-roster-short-hour-costs-more.md)): if a short
person-hour costs you three times a spare one, staff each hour for the number
of people it needed on three days in four. On two real bakeries' till exports
that cut the weighted cost of short and spare hours.

But the backtest behind those numbers scored the *headcount per hour*. Nobody
works a one-hour shift. The planner then cuts that headcount into shifts of at
least four hours (or whatever you set), and a third person wanted only for the
12:00 hour became a 12:00 to 16:00 shift. Three of those four hours are spare.
The backtest never saw them.

## Scored on the shifts

Scoring the cut shifts instead, on the Korean bakery's order file at 30,000
won of sales per labor hour, a short hour costing 3 spare ones and a four-hour
shortest shift:

| plan | short | spare | weighted cost a week |
| --- | ---: | ---: | ---: |
| headcount per hour (what the backtest scored) | 9.1 | 20.1 | 47.4 |
| the same, cut into shifts (what you would post) | 5.5 | 42.7 | 59.3 |
| cut with the new cost rule | 10.2 | 17.6 | 48.2 |

Person-hours a week, mean of 38 weeks, each planned only from the weeks
before it.

## The rule

Adding one more person at an hour where c - 1 are already on changes the
expected cost by (1 - q) - r × q, where q is the share of past dates that
needed c or more people that hour and r is your short-hour weight. On the dates
that needed them you save a short hour (-r); on the rest they stand idle (+1).

For each run too short for a shift, the planner adds that up over every window
of shortest-shift length that holds it, picks the cheapest window, and staffs
it only if the total is below zero. Otherwise the run stays unstaffed, and the
planner says so: "Left unstaffed: Mon 12:00-13:00 (person 3) ...". Runs at
minimum staff are never dropped.

## On two real files

FRENCH_SUMMARY

## What it still does not do

It prices each short run alone. On the Korean file, a third person is wanted
at Wednesday 11:00 and again at 13:00. One 11:00 to 15:00 shift would cover
both; the cut weighs them separately and drops both. Joining nearby runs, and
lengthening a neighbouring shift by an hour instead of opening a new one, are
the next step.

The code and the measurement script are MIT licensed: `demand.mjs`
(`cutShifts`, `shiftCost`) and `eval/cost-cut.mjs`, which downloads both
public files and checks their SHA-256 before it runs. Try it on your own
export on the [shifts-from-sales page](../../ventures/shift-roster-builder/shifts-from-sales.html):
everything runs in your browser. Planning aid, not legal advice.
