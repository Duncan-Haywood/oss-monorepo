---
title: "Whose delay is it? Splitting a P6 delay into owner, contractor and concurrent days"
seo_title: "Split concurrent delay between owner and contractor, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, delay-analysis, claims]
description: "XER Schedule Check's time impact analysis now takes a Party column and splits the finish delay into each party's sole delay and the concurrent days."
---

Delay claims on construction jobs rarely come from one side. The owner issues
a change while the contractor's crew is short; the city is slow with an
inspection while a supplier ships late. Both sides then argue over the same
days, and the question underneath is always the same: how much of the delay
would have happened anyway, had one side caused nothing?

[XER Schedule Check](https://marisstella.app/xer-schedule-check/) already ran
a [time impact analysis](https://marisstella.app/xer-schedule-check/how-to-run-a-time-impact-analysis-on-a-p6-schedule.html):
write the delay events as a fragnet, insert them into the P6 update, and
recompute. Today a fragnet row can name a **Party**. The tool then schedules
each party's rows alone, and every row except that party's, and splits the
finish delay three ways:

- **sole delay** for each party: the total minus the run without it, the days
  that go away only if that party's events had not happened;
- **concurrent days**: delay that stays whichever party's rows are taken out;
- and the parts add up to the whole delay, by construction.

## The worked example

On the built-in example, an invented office fit-out, the owner's change to
the level 2 MEP layout adds 17 working days of redesign and re-approval, while
the contractor's level 1 rough-in runs 20 working days long. Both feed the
same in-wall inspection.

| Run | Finish | Working days later |
|---|---|---|
| As submitted | 2026-07-27 | |
| Owner's rows alone | 2026-07-30 | 3 |
| Contractor's rows alone | 2026-08-06 | 8 |
| Both | 2026-08-06 | 8 |

Take the owner's rows out and the finish still moves 8 days, so the owner's
sole delay is 0. Take the contractor's out and it moves 3, so the
contractor's sole delay is 5. The other 3 days stay either way: concurrent.

Adding up each event alone would have said 11 days of delay against a real 8,
and nothing about whose days they are. The split answers the but-for question
directly.

## How it was checked

No public job publishes a fragnet with its parties, so fragnets were planted
in six public P6 files (up to 16,000 activities), with answers that come from
the logic and from plain one-activity runs, not from the split itself:

- two driving activities in series, one per party: no concurrent days, each
  party's sole delay equal to its own delay, 19 of 19;
- an owner lengthening an activity while the contractor adds a parallel copy
  with extra days of its own: total from the larger delay, concurrent from the
  smaller, 31 of 31;
- one party only: it owns the whole delay, 30 of 30.

One thing the first run caught: four parallel plants measured a day more than
the days added. Both parties' alone runs agreed, so the engine was
consistent; the finish sat on work on another calendar, and a working day on
that calendar is not one on the project calendar. The check now takes its
expectations from plain runs instead of arithmetic. Details:
`ventures/xer-schedule-check/eval/tia-party-check-2026-11-23.md`.

## What it does not do

It splits the modelled delay by the schedule's logic. Whether concurrent days
earn time, money, both or neither is set by the contract and the law that
governs it. The guide,
[how to split concurrent delay between owner and contractor](https://marisstella.app/xer-schedule-check/how-to-split-concurrent-delay-between-owner-and-contractor.html),
walks through it. Everything runs in the browser; the schedule is never
uploaded. Not legal, contractual or scheduling advice.
