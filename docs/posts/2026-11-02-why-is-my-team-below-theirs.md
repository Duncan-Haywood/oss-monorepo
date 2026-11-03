---
title: "Why is my team below theirs? Explaining league tie-breaks"
seo_title: "How league standings tie-breaks are decided, explained per pair"
date: 2026-11-02
tags: [league-schedule-generator, standings, tie-breaks]
description: "The league schedule generator now says which tie-break separated each pair of teams level on points, and flags pairs that nothing separates."
---

The most common argument in a rec league is not the schedule, it is the table: two teams on 12 points, one listed higher, nobody sure why.

The league schedule generator already ranked teams by points, then head to head if switched on, then goal difference and goals for. It now also says so. For every adjacent pair level on points, the printed table adds a line such as "Hawks is above Owls on goal difference (5 v 2)". When a pair is level on every criterion, the line says so and suggests a play-off or a draw instead of quietly ordering them by entry order.

It is `tieBreakNotes` in `calc.mjs`, wired into the CLI `--results` output, with four tests on made-up results. The multi-division page now shows them too, under each division's table, checked by clicking through it in a real browser. No real league's data was used, so how organisers rate the wording is still unknown.
