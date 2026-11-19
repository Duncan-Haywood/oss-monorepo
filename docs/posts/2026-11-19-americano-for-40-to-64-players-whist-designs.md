---
title: "Americano for 40 to 64 players: perfect rotations from finite fields, and why 48 still resists"
seo_title: "Americano for 40 to 64 players: perfect partner rotations"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "The free Americano builder now has perfect rotations for 40, 41, 45, 49, 53, 56, 61 and 64 players. A short proof explains why 48 and 60 need another method."
---

The free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
re-pairs players every round of a social padel, pickleball or badminton night. Since this morning it has
used *whist designs*: with 4k or 4k+1 players and a court for every four, everyone partners everyone else
exactly once and faces each of them exactly twice. The stored designs stopped at 37 players (plus 44).
The search that found them ran 25 minutes each on 40, 41, 45, 48 and 49 and found nothing. The builder
takes up to 64 players, so a big club social fell back to the greedy round-by-round search. At 40 players
on 10 courts that search repeats 26 partnerships over the cycle, and some pairs meet as opponents five
times while others never do.

Most of the gap is now closed, mostly by algebra rather than by a bigger search.

## 41, 45, 49, 53 and 61 players: no search at all

Take a finite field with 41 elements (or 49, or the product of fields with 9 and 5 elements for 45), and
an element E with E² = −1. Such an element exists whenever the field size is 1 mod 4. Multiplying by E
splits the nonzero elements into foursomes {a, Ea, −a, −Ea}. Seat each foursome at a table as
**a & −a against Ea & −Ea**, and get round g by adding g to every seat (player g sits out).

Why it works: the partner differences of a table are 2a times its foursome, and the opponent differences
are (1−E)·a times its foursome, each twice, because 1+E = E(1−E). Multiplying by the unit 2, or by the
unit 1−E, permutes the nonzero elements, so across all tables every difference turns up once as partners
and twice as opponents. That is exactly the whist condition. It takes microseconds and is checked pair by
pair for every size from 5 to 101 where it applies.

## 40 and 64 players: search one table in three

With 4k players, one fixed player ("infinity") joins the integers mod 4k−1. For 40 players that is mod 39.
Multiplying by 16 has order 3 there, and it fixes only 0, 13 and 26. Requiring the base round to be
unchanged by that multiplication forces {infinity, 0, 13, 26} onto one table and the other nine tables
into three orbits of three. The search then picks just 3 tables, not 10. It finds 40 in about a second
and 64 (mod 63, multiplier 4) in about four.

## Why 48 and 60 resist: a short impossibility proof

For 48 players (mod 47) the only usable multiplier is −1. Under −1 every table has to be a & −a against
b & −b, and its opponent differences are the classes of a+b and a−b. Add up the squares: each table gives
(a+b)² + (a−b)² = 2(a² + b²). So the opponent classes would have to satisfy 2(S − x²) = S − x², where S is
the sum of all squares 1² + … + 23² and x is the class seated at infinity's table. That leaves x² = S
(mod 47), and S = 0 mod 47, a contradiction. The same identity rules out the multiplier −1 for 52, 56, 57 and 60, and the search
agrees on every small case we tried: it finds nothing at 8 to 24 players and succeeds instantly at 28 and
40, where the identity allows it.

So those sizes need the plain search. Ported to C it runs about 60 times faster than the JavaScript
version (29 players in 0.6 s against 37 s). In 20 CPU-minutes each it found **56 players** (191 s) and
nothing for 48, 52, 57 or 60.

## What changes for a club night

| players, one court per four | before (greedy) | now |
|---|---|---|
| 40 | 26 repeat partners, opponents met 0–5 times | design: 0 repeats, every pair twice |
| 41 | 29 repeats, 0–5 | design |
| 45 | 43 repeats, 0–5 | design |
| 48 | 45 repeats, 0–5, 47 games each | 49-player design with one empty seat: 0 repeats, opponents 1–2, but one court idle a round (45 games in 49 rounds) |

Also stored: 49, 53, 56, 61 and 64. With one empty seat in the next design up, 39, 55 and 63 players get a
design too. 47, 51, 57 and 59 players stay on greedy for now. The numbers come from
[`eval/whist-vs-greedy.txt`](../../ventures/league-schedule-generator/eval/whist-vs-greedy.txt). The
constructions are in
[`eval/whist-multiplier.mjs`](../../ventures/league-schedule-generator/eval/whist-multiplier.mjs) and the
C search in [`eval/whist-search.c`](../../ventures/league-schedule-generator/eval/whist-search.c).

None of this has been played by a real club yet. The guarantee is checked pair by pair in the tests, not
at a court.
