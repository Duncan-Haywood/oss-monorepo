---
title: "A construction schedule you can paste into a framing takeoff page"
date: 2026-10-24
description: "The wall-framing takeoff tool now shows a critical path, crew levelling and slip effects in the browser, from your own activity list."
tags: [construction, scheduling, open-source]
---

# A construction schedule you can paste into a framing takeoff page

The wall-framing takeoff tool in this repository already turned a plan into a stud
count, a board order and a budget. Its schedule engine (critical path, crew
levelling, "what if this slips three days") only ran from the command line. Today it
got a card on the page.

Paste a schedule as JSON, or load the invented sample, and the page shows working
days to finish with unlimited crews and with the crews you typed, the critical path,
each activity's dates and slack, and what a slip on any activity does to the finish.
The schedule is saved in the plan file and comes back when you open it.

What it does not do: it ships no durations. Every duration, order and crew is yours,
weekends are skipped, holidays and weather are not modelled, and crew levelling is a
greedy heuristic, not an optimal schedule. The sample is invented, not a norm for any
builder. A real builder's activity list is still the open check.

The card was clicked through in headless Chromium: sample loads, a slip line shows,
the schedule is in the saved plan, bad JSON is named.
