---
title: "Bowling lane rotation: a random walk and a SAT solver close the last six uneven seasons"
seo_title: "Bowling lane rotation: every season perfectly even"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "The free bowling league schedule maker now rotates lane pairs as evenly as possible in all 36 measured seasons, up from 30. How a walk and a SAT solver did it."
---

Yesterday's post on the [bowling league schedule
page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html) ended with
a known gap. The page puts every match on a lane pair so each team bowls on every pair as evenly
as possible. In 30 of 36 measured seasons that worked perfectly. In the other 6 some team got one
pair two weeks more than another, and a SAT solver showed a perfect split existed. The search
just wasn't finding it.

All 36 are now perfect. "Perfect" here means each team's weeks on each pair differ by at most one,
and by zero when the weeks divide evenly. Here is how, including what did not work.

## Two kinds of miss

The six misses split in two. Three (10 teams over 30 weeks, 18 over 26, 24 over 34) were stuck in
local minima: re-solving any one week on its own could not improve them, even though a better
season existed. A **focused random walk** fixed those. The walk is the idea behind the WalkSAT
algorithm: pick one team whose count on some pair is out of range, look only at the swaps that
move that team's match off (or onto) that pair, and take the best one, or a random one 20% of the
time. Hill-climbing never makes those random steps, and they are what get the walk out of a local
minimum. It runs on a fixed step budget, so the same input always gives the same season.

The other three (12 teams over 30 weeks, 16 over 32, 20 over 30) are seasons where the weeks
divide evenly among the pairs, so every team must bowl on every pair *exactly* the same number of
times. With no slack, local search had a hard time. The week re-solves, a tabu search and the walk
all stopped 4 to 12 counts short.

## Asking the solver ahead of time

So the page now carries answers worked out in advance. A script runs the page's own search on
every even league from 4 to 28 teams and every season from 2 to 40 round-robin weeks, finds where
it misses, and gives each miss to CaDiCaL, a SAT solver. Every solution it finds is stored as one
character per match. Before using a stored answer, the browser checks that it is a valid
assignment every week and that every team is in range. A wrong or outdated entry can therefore
cost a little speed, but it can never make a season less even. "Try another lane deal" relabels
the pairs, which keeps the balance, and then the usual polish cuts down back-to-back weeks on the
same pair.

Of the 90 seasons on that grid the search missed, the solver solved 28, which the page now
stores. It proved 35 impossible (below), and 27 got no answer in the time given, mostly leagues
of 22 to 28 teams. Those 27 are the next job.

That last part has a cost: over the 36 seasons, back-to-back repeats rose from 340 to 392,
because even lane counts come first.

## Some seasons cannot be even

The solver also proved some seasons impossible. Take any season exactly as many weeks long as
there are lane pairs, such as 10 teams on 5 pairs for 5 weeks. A perfect split there would need every
team on every pair exactly once. With these round-robin rounds, the solver says no for every size
it tried. The same holds for 4 teams at any length. I first tried building long seasons out of
perfect blocks of that length, and this result is why that approach cannot work. For those
seasons the page shows the closest split it finds.

The scripts, the full grid of SAT answers and the measurements are in the project's
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
and its `eval/` folder. The schedule maker is free and runs in your browser.
