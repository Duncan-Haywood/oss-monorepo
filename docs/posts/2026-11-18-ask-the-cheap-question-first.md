---
title: "Ask the cheap question first: 8 seconds a solver spent on a solved week"
seo_title: "Ordering lower bounds in a shift scheduling solver"
date: 2026-11-18
tags: [performance, shift-roster-builder, optimization]
description: "Our shift roster solver spent 8 s on a lower bound that proved nothing. The next bound, which takes 0.1 s, proved the week. Trying it first saves the 8 s."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/)
assigns people to shifts and then tries to prove that no roster scores better.
To do that it builds several lower bounds, each in its own way. A bound that
reaches the roster's own score is a proof, and the search can stop.

Today we timed every test file in the repository's heaviest venture suites. One
test in this product took 49 seconds. Most of it was in a single call, and
inside that call one stage stood out.

## What the time was spent on

The week in that test is a café with one person off on Saturday. Three hours
must stay open whatever you do. The solver found a roster with three open
hours early on. Then it worked on the proof:

1. **A priced floor** (0.85 s). Pricing each shift gives a floor on open hours.
   Rounded up to whole shift lengths, the floor was already 3 hours, the same as
   the roster's. So the open-hours part was settled.
2. **A dual branch** (8.0 s). This one branches on who holds each shift, to raise
   a bound on the *whole* score: pay, balance and open hours. It used its full
   8-second budget and proved nothing.
3. **The open-hours row** (0.09 s). This bound is the whole-score LP with "at
   least 3 open hours" added as a constraint. Its first LP solve landed on the
   roster's score, and that proved the week.

So step 2 cost 8 seconds and step 3 made it pointless. Step 3 only needs the
open-hours floor, and that was final after step 1.

## The change

When the priced floor already matches the roster's open hours, nothing later in
the search can change the inputs the open-hours row would get. So the solver now
tries the row first. If the row proves the week, the dual branch is skipped. If
it doesn't, its answer is kept for later and the dual branch runs as before.

On that week the call went from 19.4 s to 11.0 s. The test file went from
49.3 s to 41.1 s. We checked the result against the old order (an option,
`rowBeforeDual: false`, keeps it). The roster, the score, the status, the lower
bound, the open hours and every person's shifts and pay came out identical. Only
the timings and search counts differ.

## How much it matters

This makes the test suite faster, and it makes real use only slightly faster.
With default settings, most weeks small enough for this search already get the
open-hours floor at the very start, before any of the steps above. The new order
helps when that early floor misses.

The broader lesson is about ordering. When several bounds can each prove the
same thing, the order you run them in is a design choice. Run the one that has
its inputs ready and finishes in a tenth of a second before the one that may take
eight seconds.

The measurements, the instrumented run over the whole suite (46 dual-branch
runs, and only this one was followed by a row that proved the week), and what we
left alone are in
[the perf note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-18-shift-roster-row-before-dual.md).

*The shift roster builder is a free, MIT-licensed tool. It makes estimates from
the rules and wages you enter. It is not legal or employment advice, so check
your local labor rules.*
