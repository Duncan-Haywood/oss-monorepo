---
title: "Prove first, polish later: a 40-person staff roster checked in 10 seconds"
seo_title: "Proving a 40-person staff schedule optimal in seconds, not minutes"
date: 2026-11-12
tags: [shift-roster-builder, product, optimisation, measurement]
description: "Timing each stage of the roster builder's exact check found two passes the proof made redundant. 40-person weeks: 15-57 s to 6-12 s, all proven."
---

The [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) has an optional exact check. It tries to prove that no roster under your rules covers more shifts or costs less than the one it shows you. On small weeks the check is quick. On a 40-person week it took long enough that nobody would wait for it, and one week in three came back "not proven".

## Where the time went

`buildRoster` now reports how long each stage took. The bench `eval/end-to-end.mjs` prints those times for seeded 20-, 30-, 40- and 60-person weeks. On the first two 40-person weeks:

| stage | week 0 | week 1 |
|---|---|---|
| quick search and ejection chains | 0.7 s | 0.5 s |
| coverage plateau walk | 10.1 s | 9.5 s |
| column generation (the proof) | 3.9 s, proven | 8.0 s, stopped at its limit |
| branch-and-bound tree | – | 37.9 s, proved nothing |
| total | 15.2 s | 56.6 s, $31.96 unproven |

Two things stand out. The tree is meant to stop at 8 seconds, but it only reads the clock every 1,024 nodes. Each node builds a flow network over all 148 shifts, so it ran almost five times over its limit. On a week this size it never finishes anyway. The plateau walk is a heuristic that looks for a roster leaving fewer hours open. Column generation finds that roster as part of its proof, so the walk's 10 seconds were spent finding something the next stage would find anyway.

## The change

On weeks above 60 shift copies with the exact check on, the builder now:

1. runs column generation right after the quick search, with 32 s instead of 8;
2. skips the tree once column generation has run, and reports its bound;
3. runs the plateau walk only if column generation did not prove the roster.

| week | before | after |
|---|---|---|
| 20 people, three weeks | 4.9-6.3 s | 1.0-1.1 s, same rosters |
| 30 people, three weeks | 9.3-12.9 s | 1.3-5.2 s, same rosters |
| 40 people, week 0 | 15.2 s | 5.7 s, same roster |
| 40 people, week 1 | 56.6 s, not proven | 9.2 s, proven, $57 less pay |
| 40 people, week 2 | 24.6 s | 11.7 s, same roster |

## The regression we caught

The first version hurt a 60-person week. Those weeks run on a 20-second budget. Column generation took 33 s and still didn't prove week 0. The walk then had no time left, and the roster ended up 11 open hours worse than before. Now, when a week has a budget, column generation gets at most half of what remains. The same week comes back at 300 open hours, as it did before, with a proven floor of 275. The other 60-person week, which had no proof at all under the old order, is proven in 8.5 s.

## What this doesn't show

These are seeded synthetic weeks, measured on one machine. The 60-person week 0 still isn't proven: the gap between 275 and 300 hours is the next hard problem. Every number above is in `ventures/shift-roster-builder/eval/end-to-end.out.txt`, and you can reproduce them with `node eval/end-to-end.mjs 40 112 3`.

The builder is free and MIT licensed, and it runs in your browser or on your own server. The exact check is a box on the page and `--prove` on the command line.
