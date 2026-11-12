---
title: "The DC dispatch needs a linear model taken more than once"
seo_title: "Repairing DC OPF dispatch on congested PGLib cases by linearisation"
date: 2026-11-12
tags: [research, energy, power-systems]
description: "The DC OPF overloads lines on all 11 congested PGLib cases. One AC-informed linearisation fixes none; relinearising fixes 7 at the AC optimum's cost."
---

Grid operators plan and price dispatch with the DC optimal power flow, a linear model with no losses and no voltages. Yesterday's step of [`research/infra-dcopf`](https://marisstella.app/research/infra-dcopf/) ran it on the 11 congested ("API") cases of the PGLib-OPF benchmark library, with the library's own line ratings. Each DC dispatch, run through an AC power flow, overloaded at least one line, up to 180 % of rating. Two cheap repairs, a uniform safety margin and an iterated loss-and-rating correction, each fixed 1 case of 11.

Today's question: what if the linear model comes from the AC power flow itself?

## The method

At an AC operating point, move each generator by 1 MW in a real AC power flow (PYPOWER) and record two things: how much the slack generator changes (the marginal loss factor) and how much the apparent flow on every line changes. With the point's own flows as offsets, that gives a linear model that carries losses and reactive flow. It is exact at the point and first order away from it. A quadratic programme on the case's costs picks the next dispatch, and the same AC check as before grades it.

Before running, I logged four predictions in the project's `LOG.md`. All four were refuted as I wrote them.

## What happened

| on 11 congested cases | clean dispatches |
|---|---|
| plain DC | 0 |
| one linearisation at the DC dispatch | 0 |
| one linearisation at the AC optimum (an oracle) | 7 |
| successive linearisation, at most 10 rounds | **7** |

- **One linearisation is not enough, even at the right point.** Taken at the AC optimum itself, the QP still finds a cheaper dispatch that the linear model calls feasible and the AC flow does not.
- **Taken at the DC dispatch, it fixes nothing.** On five cases the miss is a hair (the worst line ends at 100.05 to 100.66 %). On two the linear model has no feasible point at all. On four the starting point is far off (its slack generator is 50 to 800 MW outside its limits), so the step overshoots.
- **Relinearising closes most of the gap.** Relinearise at each new dispatch, with a step box that halves when a step makes things worse and a penalised fallback when the model has no feasible point. That is Fletcher's l1 successive linear programming, decades old. Seven cases come out clean at the AC optimum's own cost. The other four end within 0.012 % of their ratings. Each case takes 1 to 13 seconds on one CPU.

## What it does not show

I added the step rules after the first version failed on these same cases (that version cleared 3 of 12), so the 7 has no held-out test yet. PGLib's "small angle difference" (SAD) cases are the next run's held-out set. Generator voltages stay at the AC optimum's schedule, so this tests only the active-power side, and the schedule itself comes from the AC solve the method is meant to avoid. These are benchmark cases, not a real grid. The numbers are in `experiments/results_aclin.txt`, and one command reproduces them.

*Written with AI assistance (Claude).*
