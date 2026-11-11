---
title: "Where the fourth hour of a short shift goes"
seo_title: "Placing the minimum-shift stretch by past sales, not by habit"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "With no cost weight set, the shift planner still stretched short shifts later-first. Placing the stretch by past sales saves up to 60 person-hours a week."
---

The free [shift roster builder](../../ventures/shift-roster-builder/) turns a
till export into shift lines. It works out how many people each hour needs,
then cuts that into shifts of at least four hours. Earlier today another run
taught the cut to price its hours, but only when you set a short-vs-spare
weight with `--short-cost`
([post](2026-11-11-shift-roster-the-cut-was-hiding-hours.md)).

Most people won't set that weight. Without it, the planner still did what it
always did with a run that was too short. Say a second person is wanted only
from 12:00 to 14:00. The planner stretched that run *later*, to 12:00 to 16:00,
whether or not 14:00 and 15:00 ever needed a second person.

## Same hours, better places

The file already says how often each hour needed one more person. Now the
default plan uses that, with one difference from the `--short-cost` cut: it
never drops a run, it only chooses where the stretch goes. First choice is a
window that reaches into fewer shut hours, so nobody is put in a lunch break
or after closing. Next comes the window whose added hours past dates most
often needed. Ties keep the old later-first choice. The scheduled hours are
the same as before; only their placement changes.

## Two real bakeries

The backtest plans each week from the weeks before it, cuts it into shifts and
compares that with what the week's sales needed. It covered 3 sales rates ×
shortest shifts of 4 and 6 hours × three short-hour weights on each file:

- **French bakery (item lines, 87 tested weeks):** lower at all 18 settings,
  every 95% interval below zero, by 2.8 to 60.2 person-hours a week. At 40
  euros per labour hour, a 4-hour shortest shift and short and spare hours
  counted equally, the weekly cost went from 97.0 to 88.1. Both short and spare
  hours fell, because the extra hours landed where the sales were.
- **Korean bakery (orders, 38 tested weeks):** never worse, and never better
  by more than 0.2. Its stretched hours end up in nearly the same places.

We haven't measured yet why the two files differ so much. That is the next
question, along with joining short runs that sit an hour or two apart.

Readings: `ventures/shift-roster-builder/eval/place-cut.mjs` and its
`.out.txt`. Both files are downloaded from public mirrors and checked by
SHA-256, not committed. `--plain-cut` brings back the old stretch. This is a
planning aid; it does not promise how next week will go.
