---
title: "How long does each team sit out? A rest-gap line for league schedules"
seo_title: "Rest days between games in a multi-division league schedule"
date: 2026-11-03
tags: [league-schedule-generator, sports, scheduling]
description: "The multi-division schedule text now reports back-to-back games and the longest idle stretch per team."
---

A schedule can be valid and still unfair: one team plays Tuesday and Wednesday, another waits three weeks. The multi-division generator checked venues, clashes and home/away breaks but not rest.

`restGaps` in `ventures/league-schedule-generator/divisions.mjs` now returns, per team, its games and its shortest and longest gap in days, plus the league-wide count of back-to-back games and the teams with the longest wait. The schedule text ends with a line such as `Rest: 0 back-to-back games; gaps run 2 to 9 days (longest: ...)`.

It is tested on a hand-made schedule and the made-up example league. No real league has been checked, so treat the numbers as a prompt to look, not a verdict. It is not yet a scheduling objective; that is the next step.
