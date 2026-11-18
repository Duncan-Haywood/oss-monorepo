---
title: "Volleyball league tables: why a 3-2 loss earns a point"
seo_title: "Volleyball league standings: 3-2 loss earns 1 point (set scoring)"
date: 2026-11-03
tags: [volleyball, league, open-source]
description: "Volleyball leagues score 3-0 and 3-1 wins as 3 points and a 3-2 as 2 and 1. The league schedule generator's standings now has that option."
---

Football tables give 3 points for a win. Many volleyball leagues, following the FIVB rule, split points by how close the match was: a win in straight sets or 3-1 earns 3 and the loser 0, while a 3-2 win earns 2 and the loser keeps 1.

The standings code in the free league schedule generator now has a `setScoring` option for this. Scores are read as sets won, so `Ace 3 - 2 Bolt` gives Ace 2 points and Bolt 1. The default 3-1-0 table is unchanged.

One test on made-up results covers it. It is not yet a box on the page, and it has not been checked against a real league's table, so confirm your league's own rule before using it.

The code is MIT in [`ventures/league-schedule-generator`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
