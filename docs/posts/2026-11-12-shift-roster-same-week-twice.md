---
title: "Planning a month of shifts: the planner was solving the same week four times"
seo_title: "Multi-week staff schedule planner: why week 3 is week 2 again"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "A longer search budget proved no more weeks of a 4-week staff plan. The waste was rebuilding identical weeks; reusing them halves the time, same rotas."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) can plan several weeks in a row. Each week carries over from the one before: when everyone's last shift ended (so Monday morning respects the rest gap), how many days in a row they have worked, and a running tally of weekend, closing and opening shifts. Earlier today the planner moved into a background worker so the page no longer freezes while it runs. That left an open question: the page gives each week's exact check 4 seconds, half the builder's default. Would a longer budget prove more weeks?

## A longer budget proved nothing more

We planned 4 weeks of each built-in template (café, salon, retail, clinic) and of four larger synthetic weeks (30 people with 84 shift lines, 40 with 112), at 4, 8 and 16 seconds a week.

| plans | weeks | proven at 4 s / 8 s / 16 s |
|---|---|---|
| 4 templates, 4 weeks each | 16 | 16 / 16 / 16 |
| 30-person weeks, 2 plans of 4 | 8 | 8 / 8 / 8 |
| 40-person weeks, 2 plans of 4 | 8 | 8 / 8 / 8 |

Same rotas, same open hours, same pay at every budget. The exact stage never ran out of time, so the page keeps 4 seconds.

## What the readings did show

Every week of every plan was the same rota. A 4-week café plan was the same week built four times, at about 1.6 seconds each.

That is correct, and it is predictable. The carried-over rest gaps and day streaks settle after week 2 when the shifts repeat. The tough-shift tally keeps changing, but it only affects the search when the "spread weekend and closing shifts" setting is above 0, and by default it is 0. So from week 3 on, the planner was asking a question it had already answered.

Now it keeps each week it builds, keyed on that week's staff after carry-over. A later week with the same staff gets that rota back, and the page marks the row "same rota as week 2". Anything that changes the week forces a rebuild: a dated day off, a different rest gap carried over, or the tally when the spread setting is on.

| 4-week plan, exact check on | before | after |
|---|---|---|
| café template | 6.8 s | 3.3 s |
| all 4 templates | 8.4 s | 4.1 s |
| 40-person week, plan 1 | 20.0 s | 9.0 s |
| 40-person week, plan 2 | 35.6 s | 16.7 s |

An 8-week plan of all four templates now takes the same 4.1 seconds as a 4-week one. A new test checks that the reused plan's CSV, pay, open hours and score match a plan that rebuilds every week, on every template.

## What this doesn't cover

These are the built-in templates and seeded synthetic weeks, none with time off booked. That is exactly the case where weeks repeat. A real team with leave spread through the month will repeat less, and those weeks still get a full build. How often real plans repeat is the next thing to measure.

The numbers, the script (`eval/plan-budget.mjs`) and the readings are in the [project README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder), section "The planner stops rebuilding the same week".
