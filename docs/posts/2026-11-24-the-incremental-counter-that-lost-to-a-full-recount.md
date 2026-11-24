---
title: "The incremental counter that lost to a full recount"
seo_title: "Incremental cost update slower than recount in simulated annealing"
date: 2026-11-24
tags: [performance, simulated-annealing, round-robin, scheduling, web-performance]
description: "An exact move-by-move carry-over count made a league search 2.4x slower than a recount that quits early. A roster page also loads 19% faster."
---

[League Schedule Generator](../../ventures/league-schedule-generator/) searches
for round-robin seasons with low *carry-over*: how often different teams play
the same two opponents back to back (A one week, then B the next). The search is simulated annealing.
It swaps teams or rounds, re-scores the season, and keeps or undoes the move.
The profile says re-scoring (`coeOf`) is a third of the time.

The textbook fix is to stop recounting. A move changes a few rounds, and a
team's carry-over only changes next to the rounds where its opponent changed,
so you keep the pair counts and update only those steps. We built it, byes and
wraparound included. It matched the full count exactly on 12,800 random moves
and gave byte-identical seasons.

**It was 2.4 times slower** (136 s against 58 s on 30 searched seasons).

Two things beat it:

1. **The full count already quits early.** The annealer decides whether to
   keep a move by comparing its cost to a threshold it draws first. The counter
   gets that threshold and bails once even the cheapest possible remainder
   would pass it. Most moves are rejected after a few teams, so the "full"
   recount is rarely full.
2. **At league sizes, a move is not small.** A season of N teams has N − 1
   rounds. Swapping two teams touches most rounds, and swapping two rounds
   touches every team. Once you count the steps on both sides of each changed
   round, the delta does about as much work as a recount, plus bookkeeping to
   undo it.

An incremental update pays when each move touches a small slice of a big
structure. Here the structure is about as wide as it is long, and the baseline
was already lazy. A second idea, skipping the venue pass when carry-over alone
rejects a move, also kept every answer and was 15% slower. Neither is in the
code. The numbers are in
[the perf note](../history/shift-roster-page-perf-2026-11-24.md) so nobody
tries them again blind.

## What did ship: a roster page that loads less

[Shift Roster Builder](../../ventures/shift-roster-builder/) imports schedules
and staff lists from 7shifts, When I Work, Square, Deputy and CSV. The seven
importers were about a quarter of the page's script, and they loaded with the
page even though most visitors never pick a file. They now load on the first
file pick.

On a throttled connection (150 ms latency, 1.6 Mbit/s, CPU 4x slower) the page
is ready in **1,404 ms instead of 1,731 ms**. It fetches 7 files instead of 14,
and 167 kB instead of 214 kB. Every import gave the same staff and shift lines,
status messages and location pickers as before, on all seven formats we tried.
