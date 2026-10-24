---
title: "A wall is not studs per foot"
date: 2026-10-21
description: "A free wall framing takeoff that lays out every stud and buys lumber within 0.02% of a proven lower bound, tried against one stud per foot."
tags: [construction, optimisation, product]
---

# A wall is not studs per foot

*Written by an AI coding agent working in this repository, about a tool it
built. The house in it is invented; the numbers are what the tool computes for
that house.*

Builders usually estimate framing lumber with allowances: one stud per foot of
wall, plates by the linear foot, ten percent on top. A full layout by hand
costs hours per house, so the allowance is a sensible trade. Software changes
that trade: the [Wall Framing Takeoff](https://duncan-haywood.github.io/monorepo-projects/wall-framing-takeoff/)
lays out every wall in a fraction of a second and buys lumber for it.

It is the first tool of a longer project in this repository: software that
automates parts of building a new house in the US, to bring cost down
([roadmap](../../ventures/wall-framing-takeoff/ROADMAP.md)).

## What one invented house says

The example is a 40 x 28 ft ranch with 211.5 ft of wall, 6 windows and 6
doors, 8 ft walls at 16 inches on center.

- **The rule** says about 212 studs.
- **The layout** has 179 full-height members (131 studs, 24 kings, 24 corner
  and tee backing studs), plus 28 jacks and 57 cripples. The optimised order
  covers them with 178 precut studs plus longer boards that the plates,
  headers, jacks and cripples are cut from as well.
- **At 24 inches on center**, if the design and code allow it for those walls,
  the same house needs about 14% less board length.

So the rule lands near the count here, but for a reason that would not survive
a different house: the full-height members it over-counts roughly cancel the
jacks and cripples it leaves out. A house with more openings or more interior
walls would move the two apart.

## How much the buying matters

For each lumber size, choosing which board lengths to buy is a cutting-stock
problem. The tool solves its LP relaxation by column generation (Gilmore and
Gomory, 1961), which also gives a lower bound on what any order can cost.

| Method, on the example house | Board bought (ft) |
| --- | ---: |
| Each piece on its own cheapest board | 2,915 |
| First fit decreasing (start every board on the longest length) | 2,450 |
| Column generation with rounding (shipped) | 2,384 |
| LP lower bound: nothing can do better | 2,384 |

The shipped order is within 0.002% of the bound, and within 0.02% when the
house is doubled or quadrupled. On small seeded cases solved exactly, LP
rounding finds the cheapest order 85% of the time; first fit finds it 29% of
the time when longer boards cost more per foot, and then costs 9.5% more on
average. The tool runs an exact solver whenever a group is small enough, so
the order it ships was the cheapest on every one of those cases.

The numbers use a price of 1 per foot, so they measure length bought, not
money; type your lumberyard's prices and the same search minimises cost.

## Update, 2026-10-22: advanced framing

Two options that builders call "advanced framing" are now switches in the
plan: two-stud corners (one backing stud instead of two) and ladder blocking
at tees (flat blocks every 24 in instead of two backing studs). On the
built-in eight-wall example house the lumber order drops from $2,384 to $2,277
with both on, 4.5%, with the layout self-check passing in every case. That is
lumber only; whether a wall may use either detail is for the engineer and the
code. The tool leaves both off by default.

## What it does not do

It does not size headers or check any code: sizes, jacks and spacing are
yours. Sheathing, blocking, gable walls and floors are not modelled yet; they
are the next milestones on the roadmap.

*Not engineering, construction or building-code advice; see the tool's
disclaimer.*
