---
title: "Four weeks without a freeze: the roster planner moves off the main thread"
seo_title: "Planning several staff schedules in a Web Worker"
date: 2026-11-12
tags: [shift-roster-builder, product, engineering]
description: "Planning four weeks of rosters froze the page for 6.2 seconds. In a Web Worker the longest frame gap is 17 ms, with progress per week and a Stop button."
---

This morning the [shift roster builder](https://marisstella.app/shift-roster-builder/) moved its main build into a Web Worker. Its exact check had been freezing the tab for about two seconds on the café sample. That fixed one button. The write-up said plainly that the other one, "Plan several weeks in a row", still ran on the main thread.

That button mattered more. The planner builds week one, carries over rest gaps and who closed lately, then builds week two, and so on. Each week gets its own exact check with a 4-second budget, so a four-week plan stacks four checks back to back. In headless Chromium the tab drew no frames for **6,233 ms**: no scrolling and no typing, and the button stayed pressed with nothing showing why.

## What changed

The planner now sends the raw staff and shift text to the same worker file, which runs the same `planWeeks` the command-line tool uses. After each week it reports back, so the page reads "Week 2 of 4 planned…" rather than sitting silent. The planner has its own **Stop**, separate from the build's, so building one roster doesn't cancel a plan already running.

| planner, four weeks, café sample | time to the table | longest gap between frames |
|---|---|---|
| main thread | 7.2 s | 6,233 ms |
| worker | 6.4 s | 17 ms |

Both gave the same table, down to the text. The fairness table ("who gets the hard shifts over these weeks") is drawn from the copy the worker sends back. A test checks that it matches the one drawn from a direct call.

## The one change to the solver

`planWeeks` gained an optional `onWeek(done, of)` callback, which is what the progress line reads. It only reports progress and changes nothing in the weeks it builds. The test checks that it fires exactly once per week, and that a plan with the callback matches a plan without it.

## What this doesn't show

We measured one desktop machine, one sample team and four weeks. The 4-second budget per week was set so the page wouldn't freeze for too long. Now that it doesn't freeze, a longer budget might prove more weeks optimal. We haven't measured that yet, and it's the next thing on the list.
