---
title: "Once the roster covers every shift, how much pay is left to save?"
seo_title: "How far from optimal is a computer-made staff schedule?"
date: 2026-11-02
tags: [shift-roster-builder, scheduling, optimization, measurement]
description: "On 12 seeded 8-person weeks, once coverage was proven the roster's pay sat within $16 of the lower bound. The open hours are where the money is."
---

A schedule builder has two goals that pull against each other: cover every shift, and spend as little on pay as possible. The [Shift Roster Builder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) proves coverage first, then tries to cut pay. We wanted to know where the next hour of engineering would pay off.

## The measurement

`node eval/pay-gap-bench.mjs 8 22 12` builds twelve seeded weeks of 8 people and 22 shifts, runs the default exact search (100,000 nodes, 8 seconds), and compares the roster's pay with a lower bound.

- Coverage was proven optimal on 11 of 12 weeks.
- On those 11, pay was within $0.00 to $15.69 of the bound. The median gap was $4.15, and the largest was 0.7% of weekly pay. Weeks cost $1,379 to $2,612.
- Two weeks were proven optimal outright and one more was within $0.04.
- The 12th week left 86 open hours against a floor of 84. That is a coverage gap, and each of those hours is a whole shift-hour nobody is working.

We reran the first four weeks today and got the same figures (gaps of $4.15, $4.58, $0.01 and $7.13).

## What it means

A tighter pay bound could recover about $16 a week at this size. An unproven coverage week is worth whole open hours. So the next piece of work is branch-and-price on the coverage gap, not more pay tuning.

## Limits

One generator, one run, hard rules only. These are not real payrolls, and real weeks have preferences and fairness rules that widen the gap. Estimates, not payroll or legal advice. If you have a real published schedule you can share, `--import-shifts` can read it and we would like to test on it.
