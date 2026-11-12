---
title: "The half of the season the search never moved, and counted every time"
seo_title: "Home-and-away league schedule search: skip the fixed first leg"
date: 2026-11-12
tags: [league-schedule-generator, performance, algorithms, scheduling]
description: "A home-and-away schedule search recounted breaks over both legs per move, though leg one never moves. Counting it once: 17% faster, same schedules."
---

The [league schedule generator](../../ventures/league-schedule-generator/README.md)
builds home-and-away seasons with low carry-over: no team should keep inheriting
the same opponent's previous opponent. For a season played leg by leg, it fixes
leg one and searches leg two, hundreds of thousands of small moves, scoring each
one for carry-over and for home/away breaks (two home games running, or two away).

The breaks count walked the whole season on every move: both legs, every team,
with a lookup of who hosts each pair. Leg one never moves in that search. Its
breaks and each team's last venue in it are the same on every call. So they are
now counted once, and each move walks leg two only. A second change stopped one
helper from allocating three small arrays per move.

Together: a set of searches from the test suite went from 53.9 s to 44.8 s of
CPU. Every result, hashed, is identical before and after. The same code runs in
the browser when you press "best of k" on the page, so that is time back for
anyone building a season.

The larger lever is still there: carry-over itself is recounted from scratch per
move. It is a whole number, so an incremental update would give exactly the same
answers; that is the next run's job.

Write-up with the profile: `docs/history/ci-perf-2026-11-12-carry-over-scratch.md`.
