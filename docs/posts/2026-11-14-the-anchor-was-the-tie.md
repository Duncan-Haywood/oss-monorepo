---
title: "Shift scheduling: the steadier plan's extra churn came from its anchor, not its weeks"
seo_title: "Keeping staff on their usual shifts with a faster exact scheduler"
date: 2026-11-14
tags: [ventures, shift-roster-builder, scheduling, optimization, open-source]
description: "Keep-usual-shifts plans moved 4-20% more shifts when solved column generation first. The cause was their anchor week. Fixed: same plans, 1.3-1.8x faster."
---

The [shift roster builder](../../ventures/shift-roster-builder/) plans a month of
staff rotas. When someone books a day off, its default setting, *keep people
on their usual shifts*, moves the shifts that day off forces and as few others
as it can. Every week is built exactly (each roster is proven best), and since
yesterday most plans run column generation before the slower plateau walk.
The keep setting was left on the old order. On a sweep of invented teams with
scattered leave, the new order moved 4-20% more shifts week to week, and
steadiness is the point of that setting.

## Two ideas that did nothing

- **Repeat an earlier week when it ties.** That works for plain plans. In keep
  mode it never fired: the sweep's figures matched to the digit. The weeks with
  no one off already post the usual rota.
- **A tiny per-shift tie-break toward the usual rota.** The churn count measures
  shifts, and the bonus measures wage-hours, so a per-shift nudge looked like
  the fix. Again identical. A 0.01 × wage nudge is below the exact search's
  0.5 tolerance, so the proof stops before the nudge can choose.

## The anchor

Keep mode first builds the "usual week" (nobody off) and anchors every week to
it. With column generation first, that build lands on a *different tie* of the
usual week, a rota just as good on paper. Weeks with someone off then strayed
further from it. When only the anchor is built in the old order, the weeks are
built column generation first, and the plans come back the same as the old
planner's:

| days off | old planner: changes / time | now: changes / time |
|---|---|---|
| 2% | 170 / 14.2 s | 170 / 9.4 s |
| 4% | 378 / 21.5 s | 378 / 11.8 s |
| 8% | 536 / 19.9 s | 536 / 14.7 s |

Open hours and payroll are identical in every row. On 61 drawn four-week plans
the keep plans are unchanged and take 28.8 s instead of 37.6 s. The page's
default plan is now 1.3-1.8x faster with nothing else moved.

The lesson is narrow but useful: when a solver returns one of several equally
good answers, every later step that compares against that answer inherits the
choice. The anchor was a tie, and we were measuring distance from it.

Caveats: the teams are invented, the leave is swept rather than read from real
records, and the times come from one 4-core machine. Details and commands are in the
README section "Keep usual shifts, column generation first".
