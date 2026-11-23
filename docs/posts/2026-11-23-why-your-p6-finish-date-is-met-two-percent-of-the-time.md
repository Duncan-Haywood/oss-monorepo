---
title: "Why a P6 finish date is met 2% of the time, and what a delay event really costs"
seo_title: "P6 schedule risk and time impact analysis from an XER, free"
date: 2026-11-23
tags: [construction, scheduling, primavera-p6, xer, schedule-risk]
description: "Two new XER Schedule Check guides: Monte Carlo schedule risk on a P6 file and a time impact analysis from a fragnet, with worked examples checked by tests."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) has been able to run a
Monte Carlo finish-date risk analysis since 2026-11-19 and a time impact
analysis since 2026-11-20. Neither had a page that explained it to the people
who search for it: owners' reps, lenders' monitors and claims consultants who
receive a P6 file and hold no P6 seat. Today it has two:
[how to run a Monte Carlo schedule risk analysis on a P6 schedule](https://marisstella.app/xer-schedule-check/how-to-run-a-monte-carlo-schedule-risk-analysis-on-a-p6-schedule.html)
and
[how to run a time impact analysis on a P6 schedule](https://marisstella.app/xer-schedule-check/how-to-run-a-time-impact-analysis-on-a-p6-schedule.html).

## The forecast date is the unlikely one

The built-in example is an invented office fit-out: forecast finish
2026-07-27, must finish by 2026-07-31. Run it 500 times with every open
activity's remaining duration drawn from 90%, 100% and 125% of what the file
holds (the page's default, and an assumption the tool says out loud) and the
forecast date is met in **2% of runs**. The P50 is 2026-07-30, 2.1 working
days late; the contract date still holds in 92%.

Nothing is wrong with the forecast's arithmetic. It is the date on which every
activity hits its most likely duration at once, and with overruns allowed to
be bigger than underruns that almost never happens. On the public P6 files
used to test the engine, the effect grows with the network: where many paths
meet, the finish waits for the latest of them. On the three largest files the
P50 landed 7% to 19% past the CPM finish under the same range.

The run also says which work drives the finish. The example's two
board-and-tape activities run side by side. The CPM driving path goes through
level 1, but level 2 drives the finish in 53% of runs. A recovery plan that
watches only the driving path misses half the risk.

## What a delay event costs, alone and together

The time impact analysis guide uses the same file with two events: an owner
change to the level 2 MEP layout (a notice, 12 working days of redesign and 5
of re-approval) and a late hardware approval that adds 25 working days to
door procurement. Inserted together, the finish moves 9 working days. Alone,
the change costs 3 and the hardware 9: 12 between them, so 3 days of the
change order sit on time the hardware delay had already taken. Substantial
completion moves further than the last activity, 15 working days, because the
hardware now drives it through the door hanging and punch list.

## Every number is a test

Both guides quote the engine, so both are pinned by
`ventures/xer-schedule-check/guides.test.mjs`: the dates, percentages and
float counts on each page are asserted against what `cli.mjs --risk 500` and
`cli.mjs --tia` compute on the built-in example. If the engine changes, the
test fails before the page goes stale. The risk run is seeded, so the page's
default gives the same numbers in a browser.

What the guides do not say: whether an extension of time is due, or whether a
schedule is a reliable forecast. Those depend on the contract, the ranges the
people doing the work would give, and the quality of the logic, which is why
both guides point back at the DCMA check first.
