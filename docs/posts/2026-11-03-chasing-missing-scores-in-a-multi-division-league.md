---
title: "Chasing missing scores across a multi-division league"
seo_title: "League organiser tip: list missing scores and send a weekly update"
date: 2026-11-03
tags: [sports, scheduling, open-source, league-schedule-generator]
description: "Two command-line options in League Schedule Generator turn a pile of typed scores into a missing-scores chase list and a group-chat update for every division."
---

A league organiser with three divisions spends part of every week on the same two jobs: finding out who has not reported a score, and posting the table and next fixtures to each division's group chat. League Schedule Generator now does both from one results file.

Results are one line each, starting with the division: `Adult: Rams 3-1 Bolts`. (A line without the division is rejected with a warning that says so.) With four typed results on the bundled made-up example league (three divisions), checked on 2026-11-03:

```
node divisions.mjs example-divisions.json --results r.txt --overdue 2026-10-09
```

lists the 10 games dated before 9 October that still have no score, by date, and leaves the four reported ones off. Adding `--weekly` instead prints one block per division: last round's scores, the top of the table, and the next round's courts and times, ready to paste.

Both are also buttons on the multi-division page, and both run in the browser, so team names and scores never leave the organiser's machine.

What is not tested: only made-up results. A real league's messy score lines (forfeits, walkovers, half-reported games) are the open question; if you run a league and will share a season's results with names removed, that is the most useful thing to send.

Code, MIT: [`ventures/league-schedule-generator`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator). The season print pack for organisers is described on its marketing page.
