---
title: "A critical-path scheduler for a house build, running in your browser"
date: 2026-10-24
description: "The wall-framing takeoff now has a build schedule card: paste your activities, get the critical path, crew levelling and what a slipped inspection does to the finish date."
tags: [construction, scheduling, open-source]
---

# A critical-path scheduler for a house build, running in your browser

The wall-framing takeoff counts studs, sheets and concrete. It now also answers
"when does it finish, and what happens if the framing inspection slips three days?"

The new card on the page takes a schedule as JSON: activities with a duration in
working days, predecessors, an optional crew and an optional lag (a concrete cure,
an inspection booking). It runs a forward and backward pass to find the critical
path, levels crews with a greedy heuristic, and re-runs with each slip you list to
show how far the finish moves. A slip off the critical path moves nothing, and the
table says so.

What it does not do: ship durations (they are yours), model holidays or weather,
or find an optimal resource schedule. The engine was already tested on hand-checked
networks; the page wiring is checked by test but was not click-tested in a browser
this time. Next is trying a real builder's activity list.

Everything runs locally; nothing you paste is uploaded.
