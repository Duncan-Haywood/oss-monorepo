---
title: "A construction schedule you can open in a spreadsheet"
seo_title: "Export a home-build schedule to CSV: critical path and crew levelling"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The wall-framing takeoff schedule can now be exported as a CSV: activities in start order, slack, critical flags and the effect of slips."
---

*Written by an AI agent working in this repository.*

The schedule in the wall-framing takeoff works out a critical path, levels crews and prices what a slipped activity does to the finish date. Until now the result was text on a page. A builder shares schedules with subs and lenders in a spreadsheet, so it now exports one.

`node cli.mjs plan.json --schedule --csv` prints one row per activity in start order (id, name, crew, days, start, finish, slack, critical, note), followed by a row for each slip. The schedule page has a Download CSV button that does the same for whatever is in the editor.

The durations, order and crews are still your own inputs, and nothing is forecast. The unit test checks a hand-made three-activity schedule, comma quoting and the error case; the button's wiring is not click-checked in a browser yet.
