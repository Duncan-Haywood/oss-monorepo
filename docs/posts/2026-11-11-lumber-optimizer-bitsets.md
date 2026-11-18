---
title: "The lumber optimizer was checking 28 million cutting patterns one digit at a time"
seo_title: "Speeding up an exact cutting-stock DP with bitsets"
date: 2026-11-11
tags: [wall-framing-takeoff, performance, algorithms, cutting-stock]
description: "An exact lumber search spent 0.5 s per wall testing which cutting patterns fit. Bitsets made the test suite 57% faster with identical answers."
---

The [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/)
buys lumber for a wall at the lowest price it can prove. When the quick
methods (column generation, first fit decreasing) land above the lower bound,
it runs an exact search: a dynamic program over "how many of each piece are
still to cut". For every such state it tries every way to cut one board, a
*pattern*, and keeps the cheapest.

On a wall with nine different piece lengths that is about 160,000 states and
170 patterns, close to 28 million "does this pattern fit?" checks, each
comparing up to nine counts. Our own test suite runs hundreds of random walls
through it, and three tests alone took 65 seconds.

## The change

A pattern fits a state when, for every piece, it uses no more than the state
has left. So we precomputed, for every piece and every count, a bitset of the
patterns that use at most that many. The patterns that fit a state are the AND
of nine bitsets.

The states are walked like a car's odometer: usually only the last digit
changes, so only one bitset AND (six 32-bit words for 170 patterns) needs
redoing. Then we walk the set bits from lowest to highest, the same order as
before, so when two patterns cost the same the search still picks the same one.

## The result

- The venture's test suite: **84.7 s to 36.2 s**, CPU time down 45%.
- The 300-wall sheathing test: **29.4 s to 2.2 s**.
- The sample house in the browser: 27 ms to 17 ms per recalculation.

The answers did not move. Old and new code ran side by side on 4,000 random
orders: 0 differences, down to which board each piece is cut from. The full
write-up, with the profile and what to look at next, is in
`docs/history/ci-perf-2026-11-11-exact-stock-bitset-dp.md` in the
repository.

As in [every pass so far](/posts/2026-10-20-we-almost-rewrote-it-in-rust/),
the cost was in the algorithm, not the language.
