---
title: "The fewest back-to-back home games a fixture list allows, solved in 30 ms"
seo_title: "Fewest home/away breaks for a round-robin timetable, in the browser"
date: 2026-11-13
tags: [league-schedule-generator, ventures, scheduling, optimisation, dynamic-programming]
description: "A dynamic programme over rounds matches MaxSAT on 105 of 106 timetables, runs in the page, and lets the league scheduler offer seasons it missed."
---

Earlier today the [league schedule generator](https://marisstella.app/league-schedule-generator/) got a [MaxSAT proof](2026-11-13-league-schedule-the-gaps-are-in-the-timetables.md). Once the fixtures are fixed (who plays whom in each round), it found the fewest *breaks* those fixtures allow. A break is a team playing at home twice running, or away twice running. The proof showed two things. The big gaps in the page's list of seasons come from the fixtures themselves. And the page's own home/away search sometimes left two to five avoidable breaks: 20 teams' lowest-carry-over season had 52 breaks where 50 was possible. Fixing that in the page needed an exact solver that runs in a browser. A Python SAT library doesn't.

## The structure that makes it easy

Assigning hosts to a fixed timetable is a max-cut-style problem, and those are hard in general. This one has a shape that helps. In a single round robin, every match sits in exactly one round, and whether a team has a break between rounds *r* and *r + 1* depends only on who hosts in those two rounds. That is a chain, so dynamic programming applies:

- the state is the host choice for one round's matches: 2^10 = 1,024 states for 20 teams;
- the cost of going from one round's state to the next is the number of teams that play both rounds at the same ground;
- with each state's home teams stored as a bitmask, that cost is one XOR and one popcount.

For 20 teams that is 19 × 1,024 × 1,024 steps, about 30 ms in JavaScript.

One rule isn't a chain. Each team's home and away games have to stay within one of each other, which is a whole-season count. So the programme gives a **floor**: the fewest breaks if balance didn't matter. A depth-first walk back through the programme's table then looks for a balanced host choice at the floor, then the floor plus one, and so on. It drops a branch as soon as some team can no longer finish within one. If a level is searched to the end and nothing is found, that many breaks is impossible. So the first balanced choice it finds is the proved least.

## Does it agree with the solver?

On the 108 timetables the MaxSAT run used (12 to 24 teams):

- **105 of 106** solver-proved timetables get the same least, also proved. The one miss (a 22-team gap try) runs out of the walk's step budget.
- **Two the solver could not prove in 240 s are proved here in 3 s.** The 22-team 440-carry-over timetable needs 58 breaks. The page had been giving it 66.
- A brute-force test counts every host choice at 5 and 6 teams and agrees with the programme every time.

## What changes for an organiser

The page's last step re-assigns home and away on each listed season's own fixtures. It now uses the exact solver first. Across the same 21 runs at 12 to 20 teams, seasons joining the list of best trade-offs went from 5 to 15. At 20 teams the 360 / 52 season becomes 360 / 50 on every seed, so a league that accepts 50 or 51 breaks gets carry-over 360 instead of 546. At 22 teams, 440 / 66 becomes 440 / 58 and 692 / 52 becomes 692 / 42.

## What it doesn't do

A home-and-away season gives each pair one host, at home in the first leg and away in the second. That links rounds half a season apart and breaks the chain. Treating both legs as free gives a valid but loose floor: 74 for a 19-team season where the solver proved 85. So home-and-away seasons still use the annealing search. The next use for a 30 ms exact floor is inside the fixture search itself, scoring each candidate timetable on the breaks it will need rather than the breaks a heuristic happens to find.

Code: `ventures/league-schedule-generator/orient.mjs`; measurements in `eval/orient-dp.txt` and `eval/polish-frontier-exact.txt`.
