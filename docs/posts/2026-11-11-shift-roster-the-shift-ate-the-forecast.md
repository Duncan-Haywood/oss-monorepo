---
title: "The shift ate the forecast"
seo_title: "One-hour rush: stretch to a shift or leave it short? Bakery data"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A better hourly staffing plan lost its gain once cut into 4-hour shifts. Pricing each short peak against past days won it back on two real bakeries."
---

Earlier today the free [shift roster builder](../../ventures/shift-roster-builder/shifts-from-sales.html)
learned to staff each hour for a chosen share of past days instead of the
average ([the newsvendor rule](2026-11-11-shift-roster-short-hour-costs-more.md)).
On two real bakery till exports it lowered the cost of short and spare hours.

That test scored the *hourly plan*. Nobody works an hourly plan. People work
shifts, and a shift has a shortest length: if the plan wants a second person
from 12:00 to 13:00 only, the old cut stretched that hour into a whole
4-hour shift. Three of those four hours are spare on most days.

## Scoring the shifts, not the plan

So the backtest now cuts each week's plan into shifts before comparing it with
what that week's sales needed. On the Korean bakery, with a short hour costed
at three spare ones:

| | hourly plan | its shifts |
|---|---|---|
| plain average | 54.1 | 58.7 |
| newsvendor rule | 47.4 | 59.3 |

(person-hours a week, 3 × short + spare, 38 tested weeks.) The better plan
made *worse* shifts. Its extra one-hour heads were each stretched into four.

## Pricing a short peak

The fix is to ask, for each short run, what a whole shift around it costs.
The past days say how often the n-th person was needed in each hour. Adding
that person changes the expected cost by (1 − q) − r·q, where q is the share
of days that needed them and r is the short-hour weight. The cut now prices
every 4-hour window that holds the run and keeps the cheapest one. If every
window costs more than it saves, it leaves the run unstaffed and says which
hours it left short. The minimum staff is always placed, and no window may
reach into a lunch closure that the old stretch avoided.

With that, the same row costs 48.5 a week instead of 59.3. Across both
bakeries, three sales-per-hour settings and five short-hour weights (30
settings), the priced cut beat the plain stretch every time, with paired 95%
intervals below zero. It saved 2.5 to 25.7 person-hours a week on the Korean
file as the shortest shift went from 2 to 6 hours. Against what the page did
before today (average plan, plain stretch), the saving was 4.7 to 110 a week.

## What it doesn't do

It doesn't get back to the hourly plan everywhere. On the French bakery at
equal weights, the average's priced shifts still cost more than its bare
plan (78.1 against 73.2 a week). Shifts can only add or drop whole runs. The
cut is also greedy, one layer and one run at a time, and its prices come
from the same days the plan was learned on. Two bakeries is evidence, not a
rule. The "Test on my past weeks" button runs the same check on your own
till export, in your browser.

Planning aid, not legal or financial advice. The code, the eval script and
its output are in the repository (`ventures/shift-roster-builder/eval/cut-cost.mjs`).
