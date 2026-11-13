---
title: "Proving where a round-robin schedule's back-to-back games come from"
seo_title: "Round-robin home/away breaks: a MaxSAT floor for a fixed timetable"
date: 2026-11-13
tags: [league-schedule-generator, ventures, scheduling, optimisation, sat]
description: "A MaxSAT check shows the league scheduler's frontier gaps come from the fixtures, not the home/away choice, and a cheap regrounding pass adds the seasons it was missing."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) trades two kinds of fairness against each other. *Carry-over* is about order: how often a team meets the same opponent straight after the same other team. *Breaks* are about grounds: a team playing two home games, or two away games, in a row. After its searches, the page lists every season where neither number can be lowered without raising the other, and the organiser picks one.

Two holes in that list would not close. In a 20-team league where everyone meets once, the list went from 360 carry-over at 52 breaks straight to 546 at 36. In a 19-team home-and-away league it went from 1,311 at 87 to about 3,070 at 78. Two earlier rounds of work, which reshuffled fixtures and grounds together, closed other gaps but not these.

## The question a heuristic can't answer

Carry-over depends only on who plays whom in each round. Who is at home doesn't enter into it. So there were two possible explanations:

1. the fixtures were fine and the home/away search was leaving breaks on the table, or
2. those fixtures simply need that many breaks, whoever is at home.

If (1) were true, a better home/away pass alone would fill the gap at the same carry-over. A search that keeps failing can't tell you which explanation is right. A proof can.

## MaxSAT on a fixed timetable

For one fixed set of fixtures, the question "how few breaks can this have?" fits MaxSAT well:

- one true/false variable per match: is the first team at home? In a home-and-away season there is one variable per pair, because the host of the first meeting is the visitor in the second;
- hard constraints keep every team's home and away games within one of each other, as the tool requires;
- one soft clause per team per pair of consecutive rounds: "this team changes ground here". The solver minimises how many of these it breaks, and that number is the break count.

A bye resets the run, matching how the tool counts. We used the RC2 solver from python-sat. A separate JavaScript script re-checks every solution against the tool's own carry-over and break counting.

## What it proved

- **The gaps are in the fixtures.** The 20-team, 360-carry-over timetable needs at least **50** breaks; the page gave it 52. The 19-team 1,311 season needs at least **85**; the page gave it 87. No home/away assignment brings either one near the far side of its gap. Explanation (2) holds.
- **The home/away search is close to optimal.** We took the page's 12 searches at nine league sizes from 12 to 24 teams, 108 timetables in all. The solver settled 106 of them within four minutes each, and **89 of those 106 already had the fewest breaks their fixtures allow.** The other 17 were 2 to 5 breaks over. Most of those came from the searches that cap breaks, which stop once they are under the cap instead of going as low as they can.
- **Rotating the rounds doesn't help.** Every rotation and reversal of the 20-team timetable kept its 360 carry-over. The four orders the solver settled in time all needed 50 breaks. (Four more timed out, and we stopped the run there.)

## A small, cheap fix that follows from it

The proof also showed where breaks were being left behind, and the fix is cheap. After its searches the page now gives each listed season's own fixtures one more pass through the home/away search. A season comes back with the same carry-over and fewer breaks, and it joins the list if nothing else on the list beats it. It takes 0.4 to 5 seconds on a background thread.

Across 31 test leagues it added 7 seasons to the list in 4 of them. In a 20-team home-and-away league, 1,460 carry-over at 116 breaks became 1,460 at 112. For an organiser who can accept at most 112 to 115 breaks, the best carry-over on offer drops from 1,880 to 1,460. In the other 27 leagues it changed nothing, which is what the proof predicted. The four ready-made choices, and every share link made before this change, still build exactly the same season.

## What's next

Since the fixtures cause the gaps, the next step is a fixture search that knows each timetable's break floor: a fast lower bound in the inner loop, with the exact solver checking the shortlist. The [project README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator) has every figure, the solver script and the raw results.
