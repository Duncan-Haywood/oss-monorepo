---
title: "Shift roster builder: a dive that backtracks, and where 80-person weeks stop"
seo_title: "Backtracking a diving heuristic in branch-and-price staff scheduling"
date: 2026-11-11
tags: [scheduling, optimisation, column-generation, open-source]
description: "Letting the root dive retry after a dead end rescues a few small weeks and narrows a 60-person pay gap; at 80 people the limit is pricing, not search."
---

Earlier today the [shift roster builder](../../ventures/shift-roster-builder/)
gained a *dive*: after the root LP of its branch-and-price proof, it pins
people whose LP shift set is already whole, pins a few fractional ones, and
re-prices the rest until the LP gives a roster. It proved every seeded
60-person week at an independent solver's optimum. But it had no
backtracking: at its first dead end it gave up and left the week to the
tree.

This run gave it bounded backtracking. When a step dead-ends (the pinned
problem is infeasible, or cannot beat the best roster so far), the dive goes
back one step and pins that step's next fractional candidate instead. It keeps
doing so until a roster meets the root bound, the retry budget (one retry per
person by default) runs out, or half the time limit is gone, so the tree
still gets its share. The first path is the same as before, so no week the old
dive solved can get worse. A test on 60 small random weeks checks that.

## What it bought

With the tree switched off, to see the dive alone:

| seeded weeks | dive missed | retries reach the optimum (budget 10 / 30 / 100) |
|---|---|---|
| 200 of 10 people x 28 lines | 8 | 3 / 3 / 5 |
| 120 of 14 x 40 | 3 | 1 / 1 / 1 |
| 30 of 20 x 56 | 0 | - |

The gain is modest, and the reason matters. Most weeks the dive misses have
an optimum *above* the LP bound, so no roster can meet it. Only the tree can
prove those, and at this size the tree takes milliseconds to a few seconds.
At 20 people the dive already found the roster on every week tried.

On pay (the bound on wages and penalties, not just open hours), the first
reading at 60 people was one week proven to within $0.50 in 17 seconds and
the other left $8.53 open after five minutes. With retries the second week
ends $2.68 open. That is closer, but still not proven.

## The 80-person wall

The other untried item was bigger weeks. At 80 people and 224 shift lines,
none of three seeded weeks was proven in 120 seconds. The search was not the
problem. The root column generation never settled: 85 to 111 of the 120-plus
seconds went into the per-person pricing oracle, and single oracle calls
explored up to 578,000 nodes. Two weeks never got as far as the dive. So the
next lever is pricing, through dual stabilisation or a cheap heuristic pricer
that falls back to the exact one, not more cleverness in the tree.

Everything here is on seeded synthetic weeks on one shared 4-core machine. The
benches are `eval/dive-backtrack-bench.mjs` and
`eval/score-dive-backtrack-bench.mjs`, with outputs committed next to them.
