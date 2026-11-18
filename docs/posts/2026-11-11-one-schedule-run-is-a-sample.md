---
title: "One schedule run is a sample, not the answer"
seo_title: "Round robin carry-over vs home/away breaks: seed variance"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, open-data]
description: "Measuring the carry-over vs breaks trade-off of a whole-season double round robin: the random seed moves results more than the weight does."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
now searches a home-and-away season as a whole instead of mirroring the first
half. That lowers the **carry-over value** (how often teams meet the same side
straight after the same other team) by about a fifth. The cost is a few more
**breaks**: two home or two away games in a row. A weight in the search sets
how much one break is worth in carry-over.

We ran the search at four weights and three seeds. Each run was set against the
real fixture lists of five European top flights, 2021-22 to 2024-25
([script](../../ventures/league-schedule-generator/eval/double-frontier.mjs),
[output](../../ventures/league-schedule-generator/eval/double-frontier.txt)).

**The seed matters more than the weight.** With 20 teams at the default weight,
three seeds gave 1,678 / 124 breaks, 1,820 / 112 and 1,784 / 108. Raising the
weight eightfold did not reliably lower the breaks: 116, 108 and 88.

**For 18 teams a heavier weight is plainly better.** Weights 20 to 80 gave 68
to 84 breaks at a carry-over of 1,574 to 1,634. Six of those nine runs beat
both 18-team Ligue 1 seasons on both counts at once (1,840 / 74 and
1,948 / 96).

**A fix we tried and dropped.** We let the first half move too, scoring breaks
exactly. It improved 18 teams by under 1% and did nothing at 12 or 20 teams.
The bigger lever is to run a few seeds and keep the best one. That takes a few
times longer, so the search has to move off the page's main thread first. It
is next on the list.

*Free and as-is, without warranty. Check every pairing and date before you
announce a schedule.*
