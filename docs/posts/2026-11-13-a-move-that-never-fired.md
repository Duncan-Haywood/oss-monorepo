---
title: "A scheduling move that never fired, and why we kept it"
seo_title: "Covering a call-out without reshuffling the schedule: negative result"
date: 2026-11-13
tags: [shift-roster-builder, scheduling, optimization, negative-result]
description: "We taught the shift scheduler to free someone from two shifts to cover a call-out. Over 169 test call-outs it was possible 58 times and worth it zero."
---

When someone calls out, the free [shift roster builder](https://marisstella.app/shift-roster-builder/schedule-change-after-posting.html) rebuilds the posted week and tries to keep everyone else where they were. Every shift it moves can mean a short-notice premium, and it annoys people.

Yesterday it learned an "eject" move. Say the caller had Wednesday 6-14, and the only person free that morning is Ana, who is on 6-11. Ana moves up to 6-14 and gives up 6-11, which goes to someone else or stays open. That one move took the 60-person test reissues from 76 changes to 26, against a proven least of 24.

## The case it could not handle

Ana might block the open shift with two of her own shifts rather than one. Say she closes Tuesday at 23:00 and works Wednesday 9-17. Wednesday 6-14 clashes with both: it leaves only 7 hours' rest after the close, and it overlaps 9-17. Dropping either shift alone still leaves a clash, so the one-shift move never fires and the shift stays open.

So the move now has a second form. When someone is blocked by two or more of their own shifts, none of them already worked, it tries giving them all up. Each one then goes to whoever takes it at the least cost, or stays open. It is kept only if the week's score improves. A test pins the Tuesday-close case: without the move, 8 hours are left open; with it, nothing is.

## What it did on real-sized weeks: nothing

We counted how often the new form was possible and how often it was taken, across every reissue set the project measures. That's four shop templates, seeded weeks of 20 to 40 people, and two cafés:

| set | possible | taken |
|---|---|---|
| 4 templates, 56 call-outs | 6 | 0 |
| 20-person weeks, 24 | 4 | 0 |
| 30-person weeks, 24 | 6 | 0 |
| 40-person weeks, 24 | 2 | 0 |
| two cafés, 41 call-outs, every setting | 40 | 0 |

We also ran the 40- and 60-person weeks with the move on and off. Every call-out came out identical: the same open hours, the same changes (37 and 26) and the same pay, in the same time.

The reason is simple arithmetic. Two shifts given up are usually longer together than the one taken. The swap only pays off if both find a new holder. By the time this move runs, the builder has already given every shift to anyone who could take it.

## Why keep it

It costs no time we could measure, and the case it covers can happen: a closer who is also on the next day's mid shift. Without the move, a big week has to fix that case later with a chain of moves through other people, and that chain is exactly what the eject move was built to replace. This result also tells the next person something: the reissues that still change more than the least possible are trading a change for pay or fairness on purpose. They are not misses.

## A second check, same answer

The multi-week planner's "keep people on their usual shifts" setting also uses this starting roster now. We re-ran its sweep: five teams, four weeks, leave scattered at 0-8% of days, 1,600 planned weeks. Every count matched the first run to the digit: open hours, pay, changes week to week, and distance from the usual rota. All 1,600 weeks are proven optimal, so a better starting point could at most change which of several equally good rosters comes out. Here it didn't.

Teams and weeks are invented or seeded. A real posted schedule and a real call-out log would tell us more than any of this. Code and outputs: [`ventures/shift-roster-builder`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) (README "Giving up two clashing shifts", `eval/eject2-probe.txt`, `eval/steady-plan.kept-start.txt`).
