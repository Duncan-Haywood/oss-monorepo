---
title: "Equally good weeks that are not equally good months"
seo_title: "Multi-week staff scheduling: choosing between tied rosters"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement]
description: "Which of several equally good weeks a staff planner posts decides what next week can do. A one-week look-ahead kept every hour and cut changes 71%."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) can plan a month: it builds week 1, carries each person's last shift and run of days into week 2, and so on. Each week is proven the best possible under its rules. The month is not, and today's work started from a small, stubborn example of why.

## Two tied weeks, two different months

This morning the builder switched its search order for single weeks, column generation first. It proves the same best score 3.5x faster, but it often lands on a different one of several tied best rosters. For one week that does not matter. For a month it does. On the sample café with Ana off on a Tuesday and Ben on a Friday, the new order's week 2 was exactly as good as the old one's, but it ended with different people on the late shifts, and the rest gaps and runs of days it carried into week 3 left that week with 20 hours open instead of 17. So the planner stayed on the slow order, and the speed waited.

## Look one week ahead, but only when it can matter

Planning the whole month at once is the honest fix, and also a far bigger search. The cheaper question is whether the choice in week k can hurt week k+1 at all. The builder answers it with a relaxation: build week k+1 twice, once with the rest gaps and day streaks carried over from week k, and once without them. Leaving them out can only allow more. If both come out the same, no other choice for week k could have done better, and nothing more is built. That was the case for 170 of the 171 weeks we measured.

When week k+1 does fall short, the builder makes week k again the old way and posts whichever roster leaves the two weeks together with fewer open hours. It never takes an open hour this week to save one next week. One week of look-ahead cannot see a choice made two weeks earlier, so when a shortfall is still there the planner also builds the month the old way and keeps the better month. That happened on 1 of 61 plans, and the new month was as good.

## The surprise: the new order reshuffled people for no reason

Counting changes from week to week showed a second problem. With nobody off and nothing changing, the new order posted a different tied roster every week. The café cycled through three. Same pay and coverage each time, but different people on the opens and closes. Staff cannot plan around that.

So now the planner first tries the roster of the most recent week with nobody off. If that roster is still allowed and ties, it is posted again. If someone is off and it no longer fits whole, the planner builds toward it with a tiny bonus for each shift kept, and posts that if it ties. Weeks with someone off are never copied. The first version did copy them, and it carried one week's reshuffle into the following weeks.

## What it measured

We ran 61 four-week plans over five invented teams, each with one or two days off drawn at random, and built each plan three ways:

| | old planner | new order alone | new planner |
|---|---|---|---|
| open hours | 1,086 | 1,089 | **1,086** |
| person-shifts changed week to week | 1,587 | 1,793 | **465** |
| time | 54 s | 16 s | 31 s |

No plan left more hours open than before, payroll was identical, the run took 40% less time, and 71% fewer shifts changed hands from week to week. On the guide page's café plan, the week with time off now changes 5 person-shifts, which are just the ones the days off force, where it used to change 15.

The gain shrinks when time off is everywhere. On a sweep where every person-day has a 2%, 4% or 8% chance of being off, the new planner was about twice as fast with identical coverage. Week-to-week changes fell 41% at 2% and were about the same at 4% and 8%, where almost every week has someone off and there is no clean week to return to. The "keep people on their usual shifts" setting still roughly halves the changes in that regime. It stays on the old search order, because there the new one moved 4-20% more shifts.

## What steadiness costs

On six identical staff with the fairness setting off, the old planner's rosters varied by accident, so the hard shifts spread out a little (37 against 34 over eight weeks). The new one posts the same rota every week, so the same three people get the closes: 40 against 32. That is what "fairness off" should mean, and a setting of 10 still evens it to 36 each at the same cost. [The rotation guide](https://marisstella.app/shift-roster-builder/how-to-rotate-closing-and-weekend-shifts-fairly.html) now says so.

The numbers come from invented teams on one machine, and the look-ahead covers one week, not the whole month. The method, the code and every figure are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/README.md) under "The planner picks a week's tie by what it leaves the next".
