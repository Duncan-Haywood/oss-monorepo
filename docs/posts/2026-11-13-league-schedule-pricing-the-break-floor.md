---
title: "Searching round-robin timetables on their proved fewest breaks"
seo_title: "Round-robin timetables searched on an exact home/away break floor"
date: 2026-11-13
tags: [league-schedule-generator, ventures, scheduling, optimisation]
description: "Scoring each timetable on its exact fewest home/away breaks cuts carry-over by about a quarter at 48 breaks in a 20-team round robin."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) gives an organiser a list of seasons that trade two kinds of fairness against each other. **Carry-over** is about order: how often a team meets the same opponent straight after the same other team. **Breaks** count two home games, or two away games, in a row. Every season on the list is one where neither number can drop without the other going up.

In a 20-team league where everyone plays everyone once, that list had a hole. It went from 360 carry-over at 50 breaks straight to about 546 at 36 to 44 breaks. An organiser who could live with 48 breaks still had to accept 546.

## Why the earlier searches couldn't fill it

Earlier today we proved the hole comes from the fixtures, not from who is at home. The 360 timetable needs at least 50 breaks however you assign the grounds. We also put an exact solver in the page that finds a fixed timetable's fewest breaks in about 30 ms at 20 teams.

The existing "squeeze" search moves fixtures between rounds and **carries each match's ground along**. So a timetable that would be fine with *different* grounds looks bad to it, and gets rejected. Starting from 360 / 52, it never got below 50.

## Pricing each timetable on its fewest breaks

The new search leaves grounds out of the move altogether. Each candidate timetable is scored as

> carry-over + 60 × (the fewest breaks this timetable allows − the cap), counted only when over the cap.

At the end, the grounds are chosen exactly for the timetable that won. Two tricks keep this fast enough for a browser worker:

- **Only rerun what changed.** The fewest-breaks number comes from a dynamic programme over rounds. A move that changes rounds 7 to 12 keeps rounds 0 to 6 of the table and reruns the rest, about half the work on average. A test checks the shortcut gives the same answer as the full programme after every move.
- **Reject before pricing.** The annealer draws its accept/reject threshold first. The break penalty can never be negative, so a move whose carry-over alone is already over the threshold is rejected without computing its breaks. In 3,000 moves at 20 teams, only 60 to 800 needed the break programme.

One wrinkle: the fewest-breaks number ignores the tool's rule that each team's home and away games are within one of each other. So the search keeps its six best timetables, and the final step picks the one with the least carry-over whose balanced grounds still fit under the cap.

## What it found

The page now runs two of these searches into the widest hole in its list, on the same background worker as the other extras, for single round robins of 6 to 21 teams. The figures below come from 18 runs at 14, 16, 17, 18, 19 and 20 teams, three seeds each (`eval/floor-priced.txt` in the repo):

| League | Before, at that many breaks | Now |
|---|---|---|
| 20 teams, seed 1 | 546 carry-over within 48 breaks | **440 / 48** (−19%) |
| 20 teams, seed 2 | 552 within 48 | **414 / 48** (−25%), 434 / 46 |
| 20 teams, seed 3 | 550 within 48 | **412 / 48** (−25%), 460 / 46 |
| 18 teams, seed 2 | 434 within 36 | **370 / 36** (−15%) |
| 17 teams, seed 1 | 623 within 31 | **379 / 31** (−39%) |

15 new seasons joined the list in 10 of the 18 runs. Averaged over the whole list, carry-over at a given number of breaks falls 1.1%; inside the hole it falls 3.6% to 17%.

It also has limits:

- **The middle of the 20-team hole is still open.** At 40 to 44 breaks the best found are 524 to 530, only 1% to 4% better than before. The moves are still small swaps. Closing the middle probably needs a bigger move, such as re-solving two or three rounds at once.
- **19 teams gained nothing.** Every search there ended at 36 breaks or more.
- **It is slow at 22 teams and up.** A round has twice as many host choices, so one search takes 22 to 86 seconds. The page stops at 21 teams. The function still takes up to 25 for anyone running it themselves.
- **It can cost time for nothing.** One 19-team run spent 26 seconds on the worker and added no seasons. The page stays usable while it runs.

As before, these seasons only *join the list*. The four preset choices are unchanged, so every older share link still builds the same season. A season picked from the list goes into the share link and rebuilds from it.

The code is MIT licensed: `floorPricedSingleRounds` and `carryOverFloorPriced` in `carryover.mjs`, `floorTable` in `orient.mjs`, with ten tests in `floor-priced.test.mjs`.
