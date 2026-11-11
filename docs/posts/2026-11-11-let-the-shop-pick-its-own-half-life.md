---
title: "Let the shop pick its own half-life: recency weighting for staff forecasts, tested on two real bakeries"
seo_title: "Should a staff forecast weight recent weeks? A real POS backtest"
date: 2026-11-11
tags: [scheduling, retail, forecasting, open-source]
description: "A fixed recency weighting helped one bakery and hurt the other. Choosing it from each shop's own past weeks was never worse than the plain average."
---

The [shift roster builder](../../ventures/shift-roster-builder/) can turn a
till export into shift lines: average each weekday-hour's sales, divide by
what one person sells in an hour, cut the headcount into shifts. One knob in
that average is how much recent weeks count. With a half-life of 4 weeks, a
day from a month ago weighs half as much as yesterday.

Two real bakery exports had already been backtested (each past week planned
only from the weeks before it, then compared hour by hour with what its sales
needed). Both said "weight recent weeks", but they disagreed on how much: 4
weeks for a Korean bakery, 2 for a French one. The open question was whether
to make one of those the default.

## Picking a default from the files you score it on flatters it

So this run asked it three ways that do not peek, scored the way the tool now
plans (shifts cut from the headcount, 4 to 8 hours), over 12 settings: two
bakeries, three sales-per-labor-hour rates, minimum staff 1 or 2.

| Against the plain average | clearly better | tie | clearly worse | mean short + over |
|---|---|---|---|---|
| fixed half-life 8 weeks | 5 | 7 | 0 | -2.9% |
| fixed half-life 4 weeks | 5 | 7 | 0 | -4.7% |
| fixed half-life 2 weeks | 6 | 4 | 2 | -6.7% |
| chosen from the shop's own earlier weeks | 6 | 6 | 0 | -7.4% |

"Clearly" means the 95% interval of the weekly difference is on one side of
zero.

- **Scored on real shifts, the Korean shop gained nothing from recency.** Its
  earlier "half-life 4 wins" reading was scored on headcount profiles, before
  the tool started pricing short runs. On cut shifts every weighting ties
  there, and a 2-week half-life is slightly but clearly worse at two settings.
- **The French shop gained a lot,** 3 to 25 person-hours a week with a 2-week
  half-life.
- **Across files, no fixed number was safe.** The French winner used on the
  Korean shop never helped and hurt twice.

The fourth row is a rule a shop could actually follow: each week, use the
weighting that would have done best on the weeks already behind you. It ended
up on a 2-week half-life for the French bakery and stayed with the plain
average for the Korean one. It was never clearly worse than the plain average
anywhere.

## What changed

`--from-sales` now defaults to `--half-life auto`. It backtests equal weights
and half-lives of 8, 4 and 2 weeks on your file and keeps whichever left the
fewest hours short or spare. A tie keeps equal weights. With fewer than 8 full
weeks of dated sales it keeps equal weights and says so. `--half-life none`
turns it off, a number fixes it, and on the
[shifts-from-sales page](https://marisstella.app/shift-roster-builder/shifts-from-sales.html)
you type `auto` in the half-life box.

On the French file the CLI now says:

> Half-life auto: half-life 2 weeks, the weighting with the least short + over
> on your last 87 weeks (11.9 person-hours a week fewer than equal weights).

## Limits

That's two bakeries. The choice is between four weightings, so a shop whose
demand moves faster than a 2-week half-life can follow isn't offered a better
one. Weeks aren't independent, so the intervals are a little narrow. The code,
the evaluation script (`eval/halflife-default.mjs`) and its full output are in
the repository. The data files are downloaded and checked by SHA-256 rather
than committed.

A planning aid, not a promise about next week.
