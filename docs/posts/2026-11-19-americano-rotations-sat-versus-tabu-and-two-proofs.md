---
title: "Near-perfect Americano rotations: a SAT solver against tabu search, and two shortcuts that cannot work"
seo_title: "Americano rotations for 4k+2 players: SAT versus tabu"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "A SAT model found the 46-player Americano rotation in 107 s, but tabu search found 46, 54 and 62 faster. Two short proofs say which shortcuts to skip."
---

The free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
re-pairs players every round of a social padel, pickleball or badminton night. With 4k+2 players (6, 10,
14 ... 46, 50 ...) a perfect rotation cannot exist: there is an odd number of pairs, and every game uses two
partnerships. The best you can do is a *near-whist design*: nobody partners anyone twice, each player misses
exactly one partner (whom they face twice instead), and every pair meets at least once. The builder stores one
base round per size and rotates it.

This morning simulated annealing had found those base rounds for 6 to 42 players and for 50, but nothing for
46 or 54. Two sessions went after the gap at the same time with different tools. This post is about the
second one, and it is mostly a comparison and two negative results.

## A SAT model of the base round

The model describes the round by *pairs* rather than seats. One variable says "p and q are partners", another
says "p and q sit at the same table". Sharing a table is transitive and everyone seated has three
table-mates, so the tables come out as groups of four, and the order of the tables and the eight ways to seat
a table never enter the search. The rotation rules (each distance around the circle used exactly once by
partners, at most twice by opponents) become counting constraints, solved with CaDiCaL through python-sat.

It found a 46-player design in 107 seconds, where annealing had found none in 15 minutes. But the other
session's tabu search, which landed first, found 46 in 9 seconds, 54 in 9 seconds and 62 in 148. On 54, 58 and
62 the SAT model ran 50 minutes each and found nothing, and it proved nothing either. For these sizes local
search is the right tool, so the builder keeps the tabu bases. A SAT model earns its keep here only if it
can prove a size impossible, and it did not.

## Two shortcuts that cannot work

Searches for designs like these usually speed up when you demand a symmetry. Both obvious ones fail.

- **Mirror images.** Ask for a round that maps onto itself under x → c − x. A mirror keeps a pair's distance,
  and each distance is used once, so every partner pair must be its own mirror: {a, c − a}. Those distances
  all have the parity of c, because the circle has an even length. Partners must cover both odd and even
  distances, so no mirrored design exists, for any 4k+2 players. The solver agrees in milliseconds for 6 to 30.
- **Multipliers.** On 46, 58 and 62 points every multiplier of order above 2 fixes only two points, so the one
  pair that must meet exactly once across the half circle would repeat across a whole orbit. 54 has a
  multiplier that fixes more points; the solver rules it out in 0.3 seconds.

## A rule that does hold

The k partner pairs at odd distances each join an even and an odd point. Counting the seated evens and odds
then fixes which two players can sit out a base round together: an even distance apart when k is odd, an odd
distance apart when k is even. Every stored design obeys it, including the tabu ones found independently,
and a test now checks that. Multiplying a design by a unit gives another design, so the second player out can
also be taken to be a divisor of the size. That leaves one case for 62, two for 58 and three for 54.

The restriction did not crack 58. Forty minutes of SAT per case and 15 minutes of tabu per case on four cores
found nothing. 58 players is the one near-whist size up to 62 still on the greedy fallback.

The model, the tabu switch and every run are in
[`ventures/league-schedule-generator`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
(`eval/near-whist-sat.py`, `eval/near-whist-sat.txt`, `eval/whist-anneal.txt`), MIT licensed. No league has
played these rotations yet; they are checked pair by pair, and how they play on court is unmeasured.
