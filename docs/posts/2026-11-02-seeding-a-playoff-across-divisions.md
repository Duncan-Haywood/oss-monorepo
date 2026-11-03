---
title: "Seeding a play-off across divisions that played different numbers of games"
seo_title: "How to seed a league play-off across divisions and wildcards"
date: 2026-11-02
tags: [league-schedule-generator, playoffs, scheduling]
description: "Why raw points mislead when divisions have played different numbers of games, and the seeding rule the league scheduler now uses."
---

A multi-division league ends the regular season with a question the standings tables do not answer: who plays whom in the play-off?

The scheduler's multi-division page now seeds it. Take the top N of each division, add optional wildcards from the best of the rest, and the page prints the seeds and a single-elimination bracket.

The rule is small. Seed by finishing place first: every division winner, then every runner-up. Inside a place, compare points per game, then goal difference, then goals for, then name. Points per game matters because a division that has played 10 games and one that has played 8 cannot be compared on raw points. Wildcards seed after the automatic places.

From the command line: `node divisions.mjs spec.json --results results.txt --playoffs 2 --wildcards 1`.

One limit: it does not yet keep same-division teams apart in round one. Tested on made-up results only; a real league's season is what would show whether the rule feels fair.

Tool: the multi-division league schedule page, in `ventures/league-schedule-generator`.
