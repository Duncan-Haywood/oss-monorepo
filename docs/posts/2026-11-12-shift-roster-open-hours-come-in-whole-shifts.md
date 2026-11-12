---
title: "The roster was right; the proof was 2 hours short"
seo_title: "Shift scheduling: rounding the open-hours bound to whole shifts"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement, algorithms]
description: "Two call-out weeks the rota builder could not prove came down to arithmetic: with 3, 8 and 10 hour shifts, nothing leaves exactly 2 hours open."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) checks its own roster against an exact search, on by default since this morning. When the check finishes, the page says no roster under the same rules leaves fewer hours open or costs less. When it doesn't finish, it says how far off it might be.

Its guide pages quote those proven rosters. One check was still missing: the [call-out guide](https://marisstella.app/shift-roster-builder/how-to-cover-a-shift-when-someone-calls-out.html) rebuilds the sample café week about 60 times, once for each person calling out on each day they work, and nobody had asked whether every one of those rebuilds was proven.

## What we found

57 were proven. Two weren't: with a spare part-timer on staff, Cleo off Saturday and Eli off Saturday. Each rebuild left 3 hours open (a weekday lunch shift). Each spent about 40 seconds searching and stopped with a floor of 2 hours.

To find out which number was wrong, we wrote the same 59 weeks out for an independent solver (an integer program in HiGHS, with only the hard rules: availability, rest gaps, hour caps, days in a row). It agreed with the roster builder's open hours on all 59, and it proved 3 hours was the least for both weeks, in a tenth of a second each.

So the rosters were right and the proofs were short.

## Why the proof stopped at 2

Open hours aren't any old number. A shift is either covered or open, so the open hours are a sum of whole shift lengths. The café's shifts are 3, 8 and 10 hours long, and no combination of them adds up to 2. If at least 2 hours must stay open, at least 3 must.

The engine already rounded its floor up to whole hours. That can't see this, because 2 is a whole hour. Now every open-hours floor in the exact search is rounded up to the least sum of the week's shift lengths at or above it, using a small table built once per week. That includes the bound at every node of the search tree.

| week | before | after |
|---|---|---|
| Cleo off Saturday | 41 s, floor 2 h, coverage unproven | 28 s, floor 3 h, coverage proven |
| Eli off Saturday | 39 s, floor 2 h, coverage unproven | 27 s, floor 3 h, coverage proven |

The rosters, open hours and pay didn't change on any of the 59 weeks. The fix changes what the tool can prove, not what it picks.

## What's still open

Both weeks are now proven to leave the fewest hours open, but not proven cheapest: the pay bound is still $549 to $647 short. That bound comes from a linear program which can open 3/8 of an 8-hour shift instead of the 3-hour lunch, so it never learns the floor. Adding a "at least 3 open hours" row to it is the next step. The small simplex inside currently assumes every entry is 0 or 1, so that row needs real changes to it.

The details and the tests are in the venture's [README](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) ("Open hours come in whole shifts"). The ILP check is `eval/callout-ilp-check.py`.

*Invented staff and wages. A planning aid, not legal advice.*
