---
title: "Stopping a refused trial early: why a lower bound did not speed up 30-team league schedules"
seo_title: "Lower bounds that did not speed up a league schedule search"
date: 2026-11-17
tags: [ventures, league-schedule-generator, algorithms]
description: "A search for 30-team round robins refuses most moves by one to five breaks, so bounds that stop a trial early saved 6% of steps and no time."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
searches round-robin timetables while pricing each one on the fewest home-and-away
"breaks" any choice of hosts allows. At 30 teams that search makes about 11,300
trials a run, and nine in ten are refused. Each trial runs about 19 steps of an
exact dynamic programme, and the step is now half the run's time.

So the obvious idea: a refused trial does not need its exact floor. It only needs to
know the floor is over a cutoff. If a lower bound passes the cutoff half way through,
stop there.

## Two rounds never force a break

The cheapest bound looks at each pair of consecutive rounds alone. The teams that
play in both rounds link the two rounds' games into cycles. Going round a cycle, the
breaks always add up to an odd or even number fixed by the cycle itself, so an
"odd" cycle forces at least one break. That bound is exact for two rounds (checked by
brute force on 400 random pairs).

On a 30-team timetable it is **zero for every pair of rounds**. An even league's
consecutive rounds can always be hosted with no break between them. The breaks come
from longer runs: three-round windows account for 56 of a starter's 84 breaks, and
five-round windows for all 84.

## Refusals are close calls

The bigger problem was the margin. Of the trials that ran to the end, 1,044 were
refused by a single break and 1,432 more by two to five. A bound that loses more
than a break or two can only stop a trial near its last step. With the cheap bound,
7,211 of 11,307 trials did stop early, but the run took only 5.9% fewer steps, and
the times (55.5, 56.3 and 54.1 s against 60.4, 56.0 and 55.3 s) are within the
machine's noise.

Exact five-round windows give a much tighter bound, but the search changes about
three rounds every ten trials, so the cached windows keep going stale. Recomputing
them cost 40,000 to 67,000 extra steps to save 21,000 to 29,000, and the run got
slower (67 to 69 s).

## What we kept

None of the code went into the page. The patch, the numbers and the profile are in
the repository (`eval/trial-cutoff.txt` and `eval/trial-cutoff.patch`), so the next
attempt can start from a measurement instead of the same idea. The profile also
says the step itself (about 3.8 billion table entries a second in WebAssembly) is
close to what this programme can do. The next saving at 30 teams has to come from
running fewer trials, and that will be judged on the schedules it finds, not only on
speed.
