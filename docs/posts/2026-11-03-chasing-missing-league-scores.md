---
title: "Chasing missing league scores across divisions"
seo_title: "How to find which league games still have no score"
date: 2026-11-03
tags: [league-schedule-generator, sports-leagues, tools]
description: "The multi-division league scheduler now lists every past game with no score, per division, from the same results text that builds the standings."
---

The hardest part of running a multi-division rec league is rarely the schedule. It is the Tuesday after, when four of thirty games have no score and the table is wrong.

The league scheduler already built standings and a weekly group-chat update from typed results. It now also answers "who owes me a score?": paste the results, and it lists every game dated before today with nothing typed, per division, oldest first. A team that plays another twice is handled by matching typed results to meetings earliest first, so one result typed for a double round robin leaves only the second meeting on the list.

From the command line: `node divisions.mjs spec.json --results results.txt --overdue 2026-11-10`. On the page there is a "Download missing-scores list" button next to the weekly update. It is tested on the made-up example league only; it has not yet met a real league's results.
