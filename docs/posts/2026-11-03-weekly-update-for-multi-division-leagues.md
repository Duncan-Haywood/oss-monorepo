---
title: "A weekly update post for every division at once"
seo_title: "Weekly results and table post for a multi-division league"
date: 2026-11-03
tags: [league-schedule-generator, sports, scheduling]
description: "The multi-division league page now writes the weekly group-chat post for every division from the typed results."
---

League organisers post the same message every week: last round's scores, the table, who plays next. The single-league page already wrote it. The multi-division page did not, so an organiser with three divisions wrote three posts by hand.

`divisionsWeeklyUpdate` in `ventures/league-schedule-generator/divisions.mjs` now runs the single-league writer once per division on the results typed in the standings box (`U10: Hawks 3 - 2 Owls`), including forfeits and point adjustments. Results for pairs that are not scheduled to meet, or that are reported more often than scheduled, are left out and listed as warnings at the end instead of silently counted. The page has a "Download weekly update (text)" button.

Checked by a new test in `divisions.test.mjs` (64 tests pass): empty input gives each division's first round, a played first round gives scores, a table and round two, and a bad line produces a warning. Not yet checked against a real league's results; the example league is made up.
