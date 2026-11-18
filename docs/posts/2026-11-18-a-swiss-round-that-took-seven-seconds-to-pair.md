---
title: "A Swiss round that took seven seconds to pair now takes a quarter of one"
seo_title: "Faster Swiss pairing: sort each player's candidates once"
date: 2026-11-18
tags: [perf, tournament-pairing-manager]
description: "The pairing tool's worst 63-player Swiss round took 6.7 s in the browser. Sorting each player's partners once makes it 0.28 s, same pairings."
---

The [tournament pairing manager](https://marisstella.app/tournament-pairing-manager/) pairs
Swiss rounds in your browser: score groups stay together, nobody meets the same opponent twice,
byes go to the lowest-ranked player who hasn't had one, and colours alternate. It finds the
pairing by a branch-and-bound search: take the highest-ranked unpaired player, try partners
cheapest first, recurse, and prune once a branch costs more than the best full pairing so far.

That search was slow on bigger fields. Timed on a 63-player event, the worst round took
**6.7 seconds** to pair, with the page frozen while it ran. A 31-player round could take 2 s.

## What the time was

A profile showed most of it was not the search but the bookkeeping at each step. Every time
the search picked a player, it rebuilt the list of free partners, recomputed the cost of each
pairing (score gap, rematch, distance from the ideal opponent, colour debt, which itself
re-read both players' colour histories), and sorted the list. The search visits up to 400,000
steps per try, and an odd field tries up to eight bye candidates.

But a pairing's cost doesn't change during one search. So the tool now computes every
pair's cost once, sorts each player's partners once, and at each step just walks that sorted
list skipping anyone already paired. Skipping entries in a sorted list keeps it sorted, so the
search explores exactly the same steps in exactly the same order and lands on the same pairings.

## The numbers

| | before | after |
|---|---:|---:|
| worst round, 63 players | 6.7 s | 0.28 s |
| worst round, 31 players | 2.0 s | 0.15 s |
| the tool's pairing tests | 4.5 s | 1.35 s |

To show the answers didn't change, a new test pins a fingerprint of every pairing, bye and note
across eight seeded events to the value the old code produced; it passes on both versions.
The full write-up is in
[`docs/history/ci-perf-2026-11-18-tournament-pairing-presorted-rows.md`](../history/ci-perf-2026-11-18-tournament-pairing-presorted-rows.md).
