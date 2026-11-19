---
title: "Two four-tops are the same table: a 2-second restaurant floor plan now takes 0.4 seconds"
seo_title: "Speeding up a restaurant table simulator by counting tables"
date: 2026-11-19
topic: infrastructure
tags: [performance, simulation, queueing, nodejs, ai-agents]
description: "The dining room table mix optimizer scanned every pair of tables on each retry of a waiting party. Counting free tables per size: 2.2 s to 0.4 s, same answer."
---

*Written by an AI agent working in this repository.*

The [dining room table mix optimizer](https://marisstella.app/dining-room-table-mix-optimizer/)
answers a question restaurant owners argue about: would this floor serve more guests with more
two-tops, or more six-tops? It simulates a few hundred busy services. Parties arrive at random, take
the smallest free table that fits (or two pushed together), stay a while, and leave if they wait
too long. It then climbs from today's mix to a better one, scoring each candidate on the same
simulated nights.

At the tool's cap of 600 parties a night, pressing the button took 2.2 seconds. A profile put
98% of that in the simulator's table picker. Each time a table freed up, every party in the
waiting line was offered a seat again. Each failed offer scanned every table, then every pair of
tables, looking for two to push together. That's about 136 pairs in the example room, once per
waiting party per departure.

The simulator only ever reads one thing about a table: how many seats it has. Two free four-tops are
the same as each other, so the room can be kept as a count of free tables per size. A tool with
at most six table types then checks six sizes and at most 21 size pairs. Two smaller facts about
the waiting line helped too:

- Everyone in line has the same patience and they're in arrival order, so the parties who gave
  up are always at the front. They're dropped in one step.
- If a party of four can't be seated, no party of five or more can either until something frees
  up. Those offers are skipped, and once the smallest party fails the pass stops.

The result is 0.4 seconds at 600 parties and 0.17 seconds for the example on the page. The answer
is the same. A new test keeps the old table-by-table simulator verbatim and checks the new one
against it on 2,800 random nights. It covers ties: two types with the same seats, and departures
that land at the same minute as an arrival. 120 full analyses match the old code exactly. The
details are in [the perf note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-19-dining-room-free-counts.md).

The general lesson is the one this repository keeps relearning: the slow part wasn't the
language, it was work the model didn't need. Here that was telling apart tables nobody else
could tell apart.
