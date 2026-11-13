---
title: "Re-dealing three rounds of a league at once: a 3-edge-colouring as a search move"
seo_title: "Three-round re-deals in round-robin scheduling"
date: 2026-11-13
tags: [ventures, league-schedule-generator, algorithms]
description: "Re-dealing the matches of three rounds, every legal way, cuts a 20-team league's carry-over 6-10% at the tightest break budget."
---

A league schedule has two numbers organisers argue about. **Breaks**: how often
a team plays at home (or away) twice running. **Carry-over**: how unevenly the
"who did you play just before me" effect falls — if you always meet a team
straight after they have played the strongest side, you get an easier game than
the table suggests. You can have few of one or few of the other; the interesting
question is the trade-off curve.

The [league schedule generator](https://marisstella.app/) draws that curve by
searching: a dozen annealing runs, then squeezes under a break cap, then
seasons whose timetable is priced on its *proved* fewest breaks. At 20 teams the
curve had a cliff. One season sat at 360 carry-over and 50 breaks, and then
nothing until about 546 at 36 — a 14-break hole with nothing in it. Yesterday's
work proved, with a MaxSAT solver, that the hole is in the *timetables*, not in
the choice of home grounds. Today's question is how to find better timetables.

**The moves were too small.** The search had three: swap two rounds, swap two
teams across the rounds where that stays legal, and flip one alternating cycle
between two rounds. All three keep almost everything fixed. A timetable two
moves better than the current one is invisible.

**The bigger move is a re-deal.** Take three rounds. Together they give every
team exactly three opponents, which is a cubic graph on the teams. Any way of
splitting those matches back into three rounds is a proper 3-edge-colouring of
that graph — and those are easy to list: choose a perfect matching for the first
round (a short backtracking walk), and what remains is a disjoint union of
even-length cycles, each of which can go to the other two rounds in one of two
ways. So the complete list is every perfect matching times 2^(cycles), with the
current arrangement always among them. At 20 teams a random triple of rounds
yields about 117 re-deals and takes 0.7 ms to enumerate. No match changes which
two teams play it, so every pair still meets exactly once, for free.

**Pricing them is the expensive part, so don't.** Each candidate's break floor
needs a dynamic program over the rounds. Instead the move draws the annealer's
acceptance threshold first, scores all 117 on carry-over alone (the break
penalty can only add), and computes floors for the three cheapest survivors.
Fifteen percent of moves are re-deals; the rest stay cheap.

**At 20 teams, at the tightest break budget, carry-over falls 6-10%** (seeds 1
to 3: 410 → 384, 408 → 374, 426 → 384), and on one seed the middle of the hole
finally moves — 456 at 46 breaks where nothing had been under 534, 516 at 44,
524 at 42. A search costs about 1.3x the time.

**It is not better everywhere.** Run on its own, the re-deal search lost ground
on some 17- and 18-team seeds — not because the neighbourhood is worse, but
because a different random walk lands somewhere else. So the page now runs both
searches at each break budget and keeps the better. Across nine measured runs
the improvement inside the gap rises in four and holds in five; none gets worse.
That is the honest version of "a better move": it wins often enough to pay for
itself, and the cheap way to never lose is to keep both.

The tool is free, MIT-licensed, runs entirely in the browser, and the whole
measurement is in its repository (`eval/floor-priced.txt`, README section
"Re-dealing three rounds at once").
