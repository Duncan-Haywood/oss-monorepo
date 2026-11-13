---
title: "Charging a manager for slack the team already had"
seo_title: "Measuring call-out risk in a staff schedule without over-counting"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement]
description: "A quick call-out risk check over-counted badly. Counting hand-over chains raised its precision from 53% to 67% and stopped 21 trades that bought nothing."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) gained a setting this morning called *Pay for call-out slack*. You set a price per hour at risk, and the builder will give up some pay or fairness to make the week easier to cover when someone calls in sick. On the retail template, one shift changing hands cost $5.82 and removed every open hour a week of sick call-outs left behind ([this morning's post](2026-11-13-shift-roster-which-tied-roster-holds-up.md) has the run-up).

The price is charged against a quick count of "risk hours". The slow, honest measurement rebuilds the whole week once per possible call-out, which takes seconds. Far too slow to run inside a search. The quick count asked one thing per shift: if this person called out, could someone else take this shift outright, with nobody else moved?

## The quick count cried wolf

Checked person-day by person-day against the slow measurement, on the five templates and three seeded 20-person weeks, the quick count flagged 91 days. Only 48 of them really open hours when that person calls out, so it was right 52.7% of the time. On the retail template it said 54 risk hours remained on a roster where no call-out opens anything.

That matters because the price pays for whatever the count says. A false alarm is something a manager is charged to fix.

## Chains, not just stand-ins

Real cover often goes like this: Bo can't take Ana's Tuesday because Bo is already at their weekly hours, but Bo could if Cy took Bo's Wednesday. The check now tries those hand-overs, up to two passes per shift, and only on the call-out day or later, because earlier shifts have already been worked. It also hands out all of a person's shifts that day at once, so one stand-in is never counted for two shifts they couldn't both work.

| check | days flagged | really open | missed |
|---|---|---|---|
| one shift at a time (before) | 91 | 52.7% | 0 |
| one hand-over pass | 75 | 64.0% | 0 |
| **two passes (now the default)** | **72** | **66.7%** | 0 |
| three passes | 72 | 66.7% | 0 |

Retail's count now matches the slow measurement: 0 risk hours after the trade, not 54. It still never misses a day that really opens, so it remains an upper bound.

## What the old count was buying

On seeded 20-, 40- and 60-person weeks, priced at $100 an hour at risk, the old count made 21 trades worth $25.84 of score in all. By the two-pass count, not one of them cleared any risk. On the 60-person week the old count saw 846 risk hours. Two passes see 292. With the new count the builder makes none of those trades.

## Making it fast enough

On a day nobody can cover, the two-pass search ends up reading nearly everyone's schedule, and the builder repeats it for every move it considers. Uncapped, that took up to 14 seconds on the bigger weeks. A cache keyed on whose schedules each search read never got reused, for exactly that reason, so it was dropped. What shipped is a budget of 500 checks per day. A day that runs past it counts as at risk, which keeps the count an upper bound. Any trade that passes the budgeted screen is then confirmed with the full search before it is kept. The pass now takes milliseconds on the templates, up to 1.2 s on 40-person weeks and 3.5 s on the 60-person week.

## What it doesn't do yet

On the sample café, 23 days are still flagged and only 11 really open. There, a call-out is covered by reshuffling many shifts at once, which no short chain finds. Moving two shifts together isn't tried yet either. All of this is on invented teams. The details and every number are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#counting-call-out-risk-with-hand-over-chains-2026-11-13-later).
