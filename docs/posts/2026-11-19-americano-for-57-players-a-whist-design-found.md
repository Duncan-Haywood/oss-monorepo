---
title: "Americano for 57 players: the last missing rotation, found by a symmetry"
seo_title: "Americano for 57 players: a perfect partner rotation"
date: 2026-11-19
tags: [ventures, league-schedule-generator, algorithms, combinatorics]
description: "57 was the only size up to 64 with no perfect Americano rotation stored. Restricting the search to rounds fixed by multiplying by 37 found one in 11 seconds."
---

The free [Americano builder](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
plays a *whist design* when it can. In a whist design every player partners every other player
exactly once and faces each of them exactly twice. From today it has one for every size from 4 to 64
players. The last gap was 57.

## What 57 players got before

With no stored design, 57 players on 14 courts went to the round-by-round search. Over 57 rounds it
repeated 87 partnerships and left 87 pairs who never partnered. Some pairs met as opponents five
times and others never met. With the design, the same night has 0 repeats, 0 missed partners, and
every pair meets exactly twice. The number of games doesn't change: 798, with every court busy every round.

## Why it was hard, and what worked

A design on 57 players is a single base round of 14 tables. The other 56 rounds come from adding
1, 2, 3 ... mod 57 to every seat. The base round works only if its partner differences cover each
of the 28 difference classes exactly once and its opponent differences cover each class exactly
twice. Earlier runs spent about six CPU-hours on plain searches for that round and found nothing.
The most common shortcut, a round that multiplying by -1 maps onto itself, is
[provably impossible](https://arxiv.org/abs/1911.07189) at 57, because 57 is 9 mod 12.

There are two other numbers whose square is 1 mod 57: 20 and 37. This run searched only base rounds
that multiplying by one of them maps onto themselves. Every move swaps two players and their two
images together, which keeps that symmetry, so the search covers about half as many free choices.
Which of the two to use came from small cases. At 21 and 33 players, the multiplier that is 1 mod 3
and -1 mod the other prime (13 and 10) found designs in seconds, and the other one did not. At 57
that rule picks 37. It found a design in 11 to 15 seconds in each of the four runs that finished.

The page doesn't trust the search's own answer. The stored round is expanded to all 57 rounds and
checked pair by pair before it is kept, and a test checks again that the round really is fixed by
multiplying by 37. The search, its output and the before/after numbers are in the
[venture's README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
("A whist design for 57 players").

## Try it

Paste 57 names into the Americano builder and give it 14 courts. Nothing is uploaded, and the page
works offline. Nobody has run a real 57-player night on it yet. If you organise one, the printed
round sheets are the thing to check.
