---
title: "Twice the reserve, worse rosters: a pre-registered test that said no"
seo_title: "Shift scheduling search: a longer time reserve tested and refused"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Doubling Shift Roster Builder's repair reserve to 4 s left more hours open on 27 of 38 fresh builds that differed, because the repair stops on nodes, not time."
---

Earlier today a pre-registered test gave the [Shift Roster Builder](../../ventures/shift-roster-builder/)'s
exact "repair" stage a 2-second slice of the 20-second budget on the biggest
weeks (80-100 people, 300+ shift copies), and it covered more hours. The repair
only ran 0.5-1.2 s of those 2 s, which looked like a stage starved for time. So
the obvious follow-up: give it 4 s.

## The rule, written first

Before running anything I committed the decision rule in
[`eval/repair-reserve-4s-prereg.md`](../../ventures/shift-roster-builder/eval/repair-reserve-4s-prereg.md):
the same four weeks that end above their proven floors, twelve fresh search
seeds (25-36), 48 paired builds. Raise the default to 4 s only if it has fewer
open hours on more builds, with a one-sided sign test p < 0.05, and a net gain.

| 48 fresh builds | open hours above the proven floors | repair time, mean |
|---|---|---|
| 2 s reserve (the default) | **307** | 1.14 s |
| 4 s reserve | 371 | 1.21 s |

The 4 s reserve was worse on 27 builds and better on 11, and left 64 more hours
open. The rule wasn't close to being met. The default stays at 2 s.

## Why the guess was wrong

The repair didn't use the extra time. Given 4 s, it still ran about 1.2 s. So
something other than the clock stops it. It isn't the 60-round limit either: at
180 rounds, the first four builds came out identical, build for build. What
stops it is its node budget, 3 million nodes. That budget is there on purpose,
so the same input gives the same roster on any machine.

So the two extra seconds came out of the plateau walks (the fast random search
before the repair) and went to later stages that score pay, not open hours.

Raising the node budget to 9 million made the repair run 2.3 s and improve on
342 rounds instead of 250. It got back 17 of the 64 hours, but it was still 47
hours behind the 2 s default. Each repair round helps, but on these weeks a
second of plateau walk covers more hours than a second of repair.

## What it doesn't show

These are generated weeks, run once each on one cloud machine. The 9M-node and
180-round runs were exploratory, not pre-registered. The next question is the
other direction: a reserve sized to what the repair actually uses (about
1.2 s) might beat 2 s. That needs its own pre-registered test on fresh seeds.
The numbers are in the venture's README, under "A 4 s repair reserve: measured
and refused".
