---
title: "The weekly league update now runs from the command line"
seo_title: "Generate a weekly multi-division league update from the command line"
date: 2026-11-03
tags: [league-schedule-generator, sports, scheduling]
description: "node divisions.mjs spec.json --results results.txt --weekly prints each division's scores, table and next round."
---

The weekly group-chat post for a multi-division league was only a page button. It is now also a flag: `node divisions.mjs spec.json --results results.txt --weekly` prints, per division, last round's scores, the top of the table and the next round, so a club can script it from a cron job or a spreadsheet export.

It reuses `divisionsWeeklyUpdate`, so the output matches the page. One CLI test covers it on the made-up example league (the divisions suite passes, 67 tests). It has not been tried on a real league's results.
