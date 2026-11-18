---
title: "Five times faster on the sample week, and why the multi-week planner did not get the speed-up"
seo_title: "Staff scheduling optimiser: exact method first, 3.5x faster"
date: 2026-11-13
tags: [shift-roster-builder, product, optimisation, measurement]
description: "Running the exact method before the search made fresh rosters 3.5x faster, same proven score on 80 of 80 weeks. Tied rosters still differ."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) builds a week's staff roster in two stages. A fast search (simulated annealing, then a walk along rosters of equal coverage) finds a good roster. Then an exact method, column generation (the technique airline crew schedulers use), either proves no roster under your rules does better or finds the one that does and proves that.

On big weeks the exact method already ran first, and the walk only ran if the exact method proved nothing. Earlier today the call-out check and posted-schedule reissues switched to that order too, and both came out about twice as fast. Fresh builds kept the old order because the guide pages quote specific fresh rosters, down to who works which shift. This run moved fresh builds as well, re-derived every page, and found two places where the switch was not free.

## Same score, much faster

Every week was built both ways: five invented teams (café, café with a spare part-timer, salon, shop, clinic) with seeds 1-12, plus seeded weeks of 8 to 18 people.

| 80 fresh builds | walk first | exact method first |
|---|---|---|
| proven best | 80 | 80 |
| score and open hours | | same on all 80 |
| time | 36.4 s | 10.4 s |

The sample café that the page opens on went from about 1.3 s to 0.25 s a build. No build got more than 50 ms slower.

## Ties are not interchangeable

On 16 of the 80 weeks the two orders return *different* rosters at exactly the same score. That includes the café on every seed. Same payroll ($3,690), same 15 uncovered hours, but different people on the opens and closes.

That matters more than it sounds, because a roster is posted and then people call out. The builder has a "post the one a call-out hurts least" setting that, among tied rosters, picks the one where a single absence leaves the fewest hours uncovered. Summed over every Tuesday-to-Sunday call-out:

- the new default café roster leaves **100 h** at risk;
- the old order's seed-1 roster left **92 h**; across seeds 1-12 its rosters averaged 110 h (92 to 140).

There was a catch, though. The exact method lands on the same roster whatever the seed, and that setting finds its candidates by varying the seed. With the new order it would have had nothing to choose between. So it now takes the default roster first and builds its other candidates walk-first, where seeds still land on different ties. It picks the same 92 h café roster as before.

## The planner kept the old order

The four-week planner carries each week's last shifts into the next week. A Sunday close constrains Monday's open through the rest gap. So which tie week 2 posts changes what week 3 can cover. We planned 61 months both ways (five teams times 12 random time-off patterns, plus the guide page's own example):

| 61 four-week plans | walk first | exact method first |
|---|---|---|
| uncovered hours | 1,086 | 1,089 (worse on 1, better on 0) |
| with "keep people on their usual shifts" | 1,084 | 1,086 (worse on 1, better on 0) |
| time | 76 s | 27 s |

The plan that got worse was the guide page's own: Ana off on a Tuesday and Ben off that Friday, with 20 hours open in week 3 instead of 17. Two plans out of 122 is thin evidence. Still, none went the other way, and a schedule with 3 more open hours is worse for the person using it however fast it arrives. So the planner keeps the old order. The real fix is to choose each week's tie by what it leaves for the next week, and that is next on the list.

## What the guide pages say now

Each guide page's figures are pinned to the engine by a test, so the switch rewrote some of them:

- **[Changing a posted schedule](https://marisstella.app/shift-roster-builder/schedule-change-after-posting.html):** rebuilding the week after a Wednesday call-out now moves 9 to 13 other shifts (was 3 to 15). Over 41 call-outs, keeping the posted shifts still more than halves the changes: from 204 to 96, against an independent integer program's floor of 94. A new case appears too. On the new roster nobody can take Ana's Wednesday shift once Monday and Tuesday are fixed, so the honest answer is an open shift to call around on, not a reshuffle.
- **[The 14-day notice window](https://marisstella.app/shift-roster-builder/predictive-scheduling-14-day-notice.html):** the example now shows a premium nearly doubling between 10 days and 3 days out (Ana), where it used to show one nearly tripling.
- **[Labour cost by day](https://marisstella.app/shift-roster-builder/labor-cost-percentage-by-day.html)** and **[the schedule template](https://marisstella.app/shift-roster-builder/employee-schedule-template.html):** the new grid. Monday is still the worst labour day, at 36.5%.

All of this runs on invented teams and seeded weeks on one machine. The two orders are compared by measurement, not proven equivalent; where the exact method proves nothing, the walk still runs after it. The code and every measurement are in the repository (`eval/fresh-order.mjs`, `eval/plan-order.mjs`). This is arithmetic about rosters, not legal or employment advice.
