---
title: "Americano for 46 players: a SAT solver found the rotation annealing could not"
seo_title: "Americano for 46 players: a near-perfect rotation by SAT"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "A SAT model found a near-whist rotation for 46 players in 107 seconds, after 15 minutes of annealing found none. A short proof rules out mirror-image designs."
---

The free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
re-pairs players every round of a social padel, pickleball or badminton night. With 4k+2 players (6, 10,
14 ... 46, 50) a perfect rotation cannot exist: there is an odd number of pairs, and every game uses two
partnerships. The best you can do is a *near-whist design*: nobody partners anyone twice, each player misses
exactly one partner (whom they face twice instead), and every pair meets at least once.

This morning the builder had those designs for 6 to 42 players and for 50, all found by simulated annealing
on one base round that is then rotated round by round. 46 players got nothing in 15 minutes of annealing, so a
46-player social fell back to the greedy round-by-round search. Over 46 rounds on 11 courts that search
repeats 37 partnerships, leaves 60 pairs who never partner, and has some pairs meeting five times as
opponents while others never meet.

## What changed

A SAT model of the same base round found a 46-player design in 107 seconds. The builder now plays it: 0
repeat partners, 23 missed partnerships (one per player, the least possible), every pair meeting once or
twice.

The model's one idea is to describe the round by *pairs* rather than seats. One variable says "p and q are
partners", another says "p and q sit at the same table". Sharing a table is transitive and everyone seated
has exactly three table-mates, so the tables come out as groups of four. The order of the tables and the
eight ways to seat a table never enter the search, which is where a seat-by-seat model wastes most of its
time. The rotation rules (each distance around the circle used exactly once by partners, at most twice by
opponents) become counting constraints. The independent checker the builder already had,
`checkNearWhist`, re-checks every pair before a design is stored.

## Two shortcuts that do not work

Searches for these designs usually go faster when you demand a symmetry, and both obvious ones fail here.

- **Mirror images.** Ask for a round that maps onto itself under x → c − x. A mirror keeps a pair's distance,
  and each distance is used once, so every partner pair must be its own mirror: {a, c − a}. Those distances
  all have the parity of c, because the circle has an even length. Partners must cover both odd and even
  distances, so no mirrored design exists, for any 4k+2. The solver agrees in milliseconds for 6 to 30.
- **Multipliers.** On 46, 58 and 62 points every useful multiplier fixes only two points, so the one pair
  that must meet "exactly once" across the half circle would repeat across a whole orbit. 54 has a
  multiplier that fixes more; the solver rules it out in 0.3 seconds.

## Still open: 54, 58 and 62 players

Not every size fell. The same model ran 50 minutes each on 54, 58 and 62 players and found nothing. A
second trick narrowed the search: the k partner pairs at odd distances each join an even and an odd
point, which fixes how far apart the two players who sit out must be (an even distance when k is odd, an
odd one when k is even), and multiplying a design by a unit lets that distance be a divisor of the size.
That leaves one case for 62, two for 58 and three for 54. Forty minutes on each of the four tried found
nothing either, and none was proved impossible. Those sizes still use the greedy search.

The model and every run are in the repository: `eval/near-whist-sat.py` and `eval/near-whist-sat.txt` under
[`ventures/league-schedule-generator`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
It is MIT licensed. No league has played a 46-player night from it yet. The rotation is checked pair by pair;
how it plays on court is unmeasured.
