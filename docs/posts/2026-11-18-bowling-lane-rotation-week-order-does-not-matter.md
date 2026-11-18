---
title: "Bowling lane rotation: the week order does not matter, and a timeout becomes a proof"
seo_title: "Bowling lane rotation proofs: solve on counts, not weeks"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "Solving a bowling league's lane rotation as counts per round, not week by week, turns solver timeouts into instant proofs and two new even seasons."
---

The [bowling league schedule
page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html) rotates each
team across the lane pairs as evenly as the season allows. It also takes **lane limits**, such as a
team that must never bowl on the end pair. On most seasons the page gets every team inside its
fair share. Where it does not, an earlier run asked a SAT solver whether any plan could do better.
One case never got an answer: 6 teams, 32 weeks, two teams kept off the last pair. Those two
teams were on circle-method slots 0 and 4. The solver ran out of time at 300 seconds, and the
question stayed open.

## What the solver was wasting its time on

That model gave the solver one yes/no choice per match, per week, per pair. But nothing it
checked depends on the order of the weeks. The ban is per match, and the fair-share targets
are season totals per team and pair. The round robin also repeats. A 6-team league has only 5
distinct rounds, so a 32-week season plays two of them 7 times and three of them 6 times. Any
two weeks that play the same round can swap their lane plans and nothing changes. So every answer,
and every dead end, appears about 7!² × 6!³ ≈ 10¹⁶ times over. The solver was searching those
copies.

## Counting instead

The new model (`eval/bowling-count-model.py`) keeps one number per distinct round, match and pair:
how many of that round's weeks put that match on that pair. For each round, those numbers form a
square table whose rows and columns all add up to the number of times the round is played. A
classical theorem (Birkhoff–von Neumann, or Kőnig's edge-colouring theorem for bipartite graphs)
says such a table always splits into that many one-to-one week plans. So every answer to the
small model is a real season, and every real season gives an answer. Team totals are sums of those
numbers, so the bans and targets go in unchanged. After solving, the script splits each table back
into weeks with repeated matchings. It then re-checks the full season, week by week, before it
prints anything.

## What it settled

- **6 × 32, two teams off the last pair, slots 0 and 4:** proved impossible in under a tenth
  of a second. All 15 ways of seating those two teams are now proved, so no dealing of the round
  robin can keep both teams off that pair and still give everyone an even rotation. Two or three
  counts off target, which is what the page gives, is the best that season allows.
- **6 × 26 with the three random limits** from the 142-season test grid, never checked on other
  dealings until now: 60 of 60 dealings are impossible.
- So the page's three misses on that grid are not search failures. Each is proved out of reach
  for every dealing.
- **Check against the old model.** On 12 limit cases and 5 seasons without limits that the old
  model had already settled, the new one gives the same verdict every time. All six known solvable
  cases come back solvable, with plans that pass the re-check.

## Where it does not help

The gain comes from rounds repeating. A season shorter than one full round robin plays every round
once, so the count model is just the week model with extra steps. There the existing SAT model was
as fast or faster: 25 s against 37 s at 16 teams × 24 weeks, for example. There are 27 seasons
without limits where no even rotation has been found yet. I ran the 9 that span two or more full
cycles, at 240 s each. It solved two: 16 teams × 40 weeks (67 s, never run before) and
24 teams × 35 weeks (152 s, where the old model gave no answer in 420 s). Both answers are now
stored, and the page gives every team its fair share on both seasons. It was 8 and 2 counts off
before. The other seven timed out, so for big leagues the count model is a better start, not the
end of the problem. The full log is in `eval/bowling-count-model.txt`.

Everything here is measured on the page's own seasons; the page gives a schedule to check, not a
guarantee, and a league should confirm lane use with its centre.
