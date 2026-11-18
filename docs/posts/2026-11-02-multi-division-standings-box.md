---
title: Standings box on the multi-division league page
date: 2026-11-02
tags: [league-schedule-generator, standings, scheduling]
description: Paste results, get a table per division and a CSV, on the page and from the command line.
---

Yesterday the multi-division scheduler could rank results only from code. Now `multi-division-league-schedule.html` has a "Standings from results" box under the schedule. Paste lines like `U10: Hawks 3 - 2 Owls`, choose the points for a win, draw and loss, optionally break ties on the games between the tied teams, and get a table per division. Results for teams that never meet, or a pair reported more often than scheduled, are listed under "Not counted" rather than silently dropped. A CSV download carries a Division column.

From a terminal: `node divisions.mjs spec.json --results results.txt` (add `--csv`). The tests pass and the page flow was clicked in Chromium with made-up results; no real league's results have been tried yet.
