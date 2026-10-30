---
title: "One sheet for every division: a season grid for multi-division leagues"
date: 2026-10-30
tags: [league-schedule-generator, scheduling, export]
description: "The multi-division league scheduler now writes a team-by-night grid CSV, so a club with several divisions on shared courts can pin the whole season to one wall."
---

A club that runs under-10, under-12 and adult divisions on shared courts gets a night-by-night list from the [league schedule generator](https://duncan-haywood.github.io/oss-monorepo/league-schedule-generator/). Coaches ask a different question: when do my team's games fall, and where?

The single-league page already had a season grid. The multi-division page did not. It now has "Download season grid CSV", and `node divisions.mjs spec.json --grid` writes the same file. Each row is a team, with its division first so two teams sharing a name stay apart. Each column is a playing night. A cell reads `v Wolves 18:00 Gym B` at home or `@ Lynx 18:00 Gym B` away, and is blank on a night off.

On the bundled example (three divisions, 11 nights) every match appears exactly twice, once in each team's row, and the test checks that. It was tested through the function and the command line; the page button has not been clicked in a browser.
