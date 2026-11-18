---
title: "The fewest back-to-back home games in a home-and-away season, proved in the browser"
seo_title: "Minimum breaks in a double round robin, proved by branch and bound"
date: 2026-11-13
tags: [league-schedule-generator, ventures, scheduling, optimisation]
description: "A 20-team home-and-away timetable the scheduler gave 116 breaks needs only 108. A small exact search now finds and proves that in the page."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) counts a *break* whenever a team plays two home games, or two away games, in a row. Earlier today it gained an exact solver for one kind of season, where everyone meets once. That solver works round by round and is cheap: the hosts of one round form a state, and the fewest breaks up to the next round is a minimum over those states.

Home-and-away seasons were left out. There, each pair of teams keeps one host: if you're at home in the first meeting, you're away in the return. That rule links rounds that may be twenty weeks apart, so the round-by-round method can't see it. With the rule dropped it still gives a lower bound, but a loose one. On one 19-team timetable the bound said 74, and a MaxSAT solver proved 85.

## Putting the rule back

The standard move is to charge for breaking the rule instead of forbidding it. Each pair gets a price on "both games hosted by the same team", the round-by-round method minimises breaks plus charges, and whatever comes out, minus the charges, is still a valid lower bound. Adjust the prices and the bound rises.

Here, though, it didn't rise at all. If you flip every host in a season (every home game becomes away), every break stays a break, and every pair's rule violation changes sign. So the bound is symmetric in the prices, and for a concave function that symmetry puts the best price at zero. Charging for the rule gained nothing.

The fix is to fix one pair: say the lower-numbered team hosts their first meeting. Any season can be flipped to satisfy that without changing its breaks or balance, so nothing is lost, and the symmetry is gone. Then the prices do work: 74 rises to 78 on that 19-team timetable. That still leaves a gap of 7, so the solver branches on whichever pair the bound's best answer breaks with the highest price, tries both hosts, and drops any branch whose bound can't beat the best season found so far. Every step of the bound also produces a real season (keep the first-game hosts, flip the return games), so good answers turn up early.

## What it found

I checked it against MaxSAT proofs for the page's own 84 home-and-away timetables at 8 to 20 teams:

- On the 75 that both MaxSAT and the new search proved, they agree on all 75.
- It proved 4 that MaxSAT couldn't finish in two minutes.
- One of those 4 is the page's 20-team season with the lowest carry-over: 1,460 carry-over at **116 breaks**. Its timetable needs only **108**. The search proves it in under half a second, because once one pair is fixed, the bound alone already says 108.
- 8 of the 84 seasons get fewer breaks than the page had given them. For example, an 18-team season goes from 88 to 84.

At 4 to 6 teams, the tests also check it against every possible host choice counted by brute force.

## In the page

The regrounding pass for home-and-away seasons now runs this search after its annealing, using the annealing's result as the bound to beat. On the same 10 test runs as before, 6 regrounded seasons join the list of best trade-offs, against 2 before, in 5 runs instead of 2. The 20-team 1,460 season now shows 108 breaks with "proved" beside it.

The cost is time. At 18 to 20 teams the pass took 26 to 76 seconds on the background worker in my test, though that run had four jobs sharing four cores. The list fills in while the page is already usable. The search budget is counted in nodes rather than seconds, so a shared link rebuilds the same season on any machine.

## What it doesn't do yet

Five of the 84 timetables were not proved within the 400-node budget. The worst is an 18-team timetable the search takes from 98 to 92 breaks, where MaxSAT proves 90. The obvious next step uses the exact count for search rather than polish: score candidate home-and-away timetables by their proved fewest breaks, as the single round robin search already does.

Code: `orient.mjs` (`pairLeastBreaks`), with the measurements in `eval/pair-exact.txt` and `eval/polish-frontier-pair.txt` in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
