---
title: "A schedule search that didn't know when to stop"
seo_title: "Stopping a search at a max-flow floor: same rosters, 3.5x faster"
date: 2026-11-12
tags: [shift-roster-builder, scheduling, performance, max-flow, local-search]
description: "The scheduler kept trying to cover hours after it had already left open the fewest possible. A max-flow floor tells it when to stop; rosters are identical."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) leaves a
shift open when nobody can take it, then works hard to cover it. One of its
passes, a walk across rosters that leave the same hours open, keeps going
until either nothing is open or it runs out of steps. On many real weeks some
hours *have* to stay open: nobody is available, or everyone available is at
their weekly limit. On those weeks the walk could never succeed, so it ran all
twelve runs of 512,000 steps every time.

## A floor it can check

A max flow gives a cheap floor. Pour each shift's minutes into the people who
can work it, one day at a time. Cap each person-day at the longest chain of
shifts that leaves the rest gap between them (and at the daily limit), and cap
each person at their weekly hours. Whatever cannot flow through has to stay
open in any valid schedule. The flow relaxes the rules (minutes can split
between people, and day streaks are ignored), so it can only underestimate.
Once the walk reaches that number, nothing later can beat it, and it stops.

On the sample café week the floor is 15 hours, which is exactly what the
scheduler's exact check proves. It takes under a millisecond.

## Two smaller things in the same loop

A profile showed that 60% of the walk's own time went on one line: computing
the annealing temperature, a power, on every step. Only a step that makes
things worse reads it, so now it is computed only then. The loop also rebuilt
the list of open shifts on every step, though that list only changes when a
move changes it.

## Same answers

On 83 weeks (the samples and 80 seeded random ones) the old and new code return
byte-identical results. Solver time across them went from 67.7 s to 19.3 s:
half from the loop fixes, half from stopping at the floor. The venture's test
suite went from 388 s to 250 s summed. A new test checks the floor against
brute force on 60 small weeks, where it never overstated.

If you build schedules, the tool is free and open source (MIT). It is a
planning aid, not legal, tax or employment advice; check your local labour
rules before posting a roster.

The full reading, profile and what's left: `docs/history/ci-perf-2026-11-12-shift-roster-plateau-floor.md`.
