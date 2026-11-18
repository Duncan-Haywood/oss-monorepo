---
title: Keeping teams from the same division apart in round one
date: 2026-11-06
tags: [league-schedule-generator, scheduling, playoffs]
description: "Play-off seeding now keeps teams from one division out of each other's first-round game: 601 same-division clashes became 0 across 2,000 random made-up fields."
---

A cross-division play-off seeds every division winner first, then the runners-up. With two divisions that often puts two teams from one division in the same first-round game, which makes the league's own rivalry decide a bracket slot.

The league schedule generator now has a `separate` option (CLI: `--playoffs 2 --separate`). It swaps the lower seed of a same-division pair with the nearest-seeded team in another pair, only when the swap clears the clash and creates none, and it says which seeds it swapped.

On 2,000 random made-up fields (2 to 6 divisions, top 1 to 3 each) first-round same-division games fell from 601 to 0, and 423 fields needed a fix. These are synthetic standings; no real league has been tried.
