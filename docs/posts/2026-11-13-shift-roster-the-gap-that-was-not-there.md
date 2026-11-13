---
title: "The 25-hour gap that was never there"
seo_title: "Proving a 60-person staff schedule leaves the fewest open hours"
date: 2026-11-13
tags: [shift-roster-builder, product, optimisation]
description: "A 60-person week sat unproven at 300 open hours over a 275 h bound. The bound was the problem: a 1.3 s LP with clique rows proves the 300."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) tries to prove that its schedule leaves the fewest hours uncovered. Then it tries to prove the payroll is the lowest. For weeks up to about 40 people it manages both in seconds. One seeded 60-person test week, with 245 shift copies, had stayed stubborn for days. The roster left 300 hours open, and the best floor the engine could prove was 275. That 25-hour gap had been on the to-do list as "close the 60-person gap".

## Ask someone else first

Before trying to close it, I asked an independent solver what the true answer was. The same week went to HiGHS, an open-source mixed-integer solver. It proved 300 hours optimal in 4.9 seconds, at its very first node. So the schedule was already the best possible. The 275 came from the engine's bound, which simply hadn't finished. The column generation behind it was still pricing new shift patterns when its 34 seconds ran out.

The HiGHS log said why it found this easy. Its presolve took 131,000 rows of the form "this person can't work both of these shifts, because the rest gap between them is too short" and merged them into a few hundred rows of the form "at most one of these shifts". Those groups are cliques. Each shift becomes an interval from its start to its end plus the rest gap, and two shifts clash exactly when their intervals overlap. A set of intervals that share a common point all clash with each other. For intervals, the clique rows describe exactly which sets of shifts a person can hold, which the pairwise rows don't.

## Building the same thing in

The engine now builds that compact LP itself and solves it with the simplex method it already ships. The LP has one row per shift copy (held or open), one row each for every person's weekly and daily hour caps, and one row per clique, with no external solver. On the stubborn week it gives 300.000 hours in 1.3 seconds. On three 80-person weeks it gives the proven 257, 331 and 281 hours in 4.5 to 6.3 seconds. The engine's own proof of those took 42 to 86.

The number used is a duality bound, not the LP's reported objective, so floating-point rounding in the simplex can't make it too high. It was also checked against brute force on 240 tiny weeks with varied rest gaps, daily caps and late finishes the week before. It was never above the true least, and it matched exactly on 174 of the 223 weeks that had to leave hours open.

In a full build of the 60-person week with the 20-second budget, coverage is now proven at 300 hours, and the build finishes in 15.7 s instead of 21.1. The coverage search can stop as soon as it reaches the proven floor.

## What didn't work, and what's still open

Feeding the new floor into the payroll bound as an extra row seemed the obvious next step. It made things worse: that LP converged more slowly, and another week lost a payroll proof it had been making in 8 seconds. So the floor proves coverage only. Payroll on that week is still unproven.

The 100-person weeks are a different story. There the clique LP lands on the same 358 and 344 hour bounds the engine already had, and HiGHS, given the clique model and 300 seconds, found worse schedules than the engine's 359 and 347. Those gaps are in the search, not the bound.

The lesson for the to-do list: before closing a gap, find out which side of it is wrong.

Seeded synthetic weeks, one cloud machine. Full tables: the [README section](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#the-60-person-weeks-300-open-hours-are-the-least-2026-11-13). Planning aid, not legal advice.
