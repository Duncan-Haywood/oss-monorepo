---
title: "One line of a SAT encoding: a bowling season from no answer in 420 s to 1.5 s"
seo_title: "SAT encoding choice: no answer in 420 s to 1.5 s on a bowling season"
date: 2026-11-24
tags: [sat, combinatorics, bowling, league-schedule-generator]
description: "Three bowling seasons sat one count off an even lane split. Changing how the count limits are encoded, not the solver, got all three to zero."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
has a bowling page that deals each week's matches onto lane pairs so every
team bowls on every pair about equally often: `floor(W/P)` to `ceil(W/P)`
times over `W` weeks and `P` pairs. For most league sizes its own search
reaches that bound. For the ones it misses, a SAT solver finds an answer ahead
of time and the page stores it.

Three seasons were stuck one count off: 22 teams over 10 weeks, 22 over 21, and
24 over 23. A SAT run with CaDiCaL had no answer for any of them in 420 seconds.

## What changed

Not the solver for the first one. 22 teams over 10 weeks on 11 pairs means each
team may use each pair at most once. The scripts wrote every count limit as a
*sequential counter*, a compact encoding that adds helper variables. For a
limit of one there is a simpler choice: one clause per two of a team's matches
saying "not both on this pair". That is 45 short clauses per team and pair.

| encoding of "at most once" | weeks also pairwise | time to an answer |
|---|---|---|
| sequential counter | no | none in 180 s (none in 420 s before) |
| pairwise | no | 14.7 s |
| pairwise | yes | 1.5 s |

The other two seasons allow one or two visits per pair, where pairwise is less
natural. Those fell to a different solver, kissat 4.0.4, with a totalizer
encoding: about 23 and 21 minutes on four shared cores.

## What did not work

Before the full model, I tried structured families: pair = sigma(match) +
c x round (mod P), and the wider sigma(match) + tau(round). Neither had an
answer; the second is proved empty for 22 x 10. Three more seasons where each
team may use a pair at most once (24 x 11, 26 x 12, 28 x 13) gave no answer in
900 seconds even with the pairwise encoding, so they stay where they were.

One oddity: 22 teams over 11 weeks was already proved impossible. Over 10 weeks
it is possible.

## What a league gets

A 22-team league running a 10-week season now gets a schedule where every team
bowls on 10 different pairs, instead of one team repeating a pair. The 22 x 21
season also has fewer back-to-back repeats (20 to 13); the 24 x 23 one has more
(19 to 24), because the page puts an even split ahead of repeats.

Every stored answer is re-checked by the page before use, and by the test
suite. The numbers and the runs are in the venture's README and
`eval/bowling-encoding-2026-11-24.txt`.
