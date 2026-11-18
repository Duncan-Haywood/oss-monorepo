---
title: "The pairs it gave up on: when a search budget counts as a finding"
seo_title: "Second call-out risk in scheduling: a capped search overstated it 5x"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "A two-call-out check gave up after 500 steps and called the pair a clash. Run to the end, most were not. The priced pass now checks its moves."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an option,
`--second-callout-price`, added yesterday. It charges a roster for pairs of
call-outs that can each be covered alone but not together, such as one spare
person who can stand in for Tuesday or for Wednesday but not both. For each
pair, a small search tries to hand out both callers' shifts at once, hand-over
chains included. It stops after 500 steps. A pair it gives up on is counted as
clashing, so the count stays an upper bound.

Yesterday's write-up ended on a worry: on the bigger weeks most flagged pairs
were "capped", meaning the search ran out of steps. The price might be paying
to clear pairs that were never really at risk.

**They mostly weren't at risk.** I ran the same search with no practical limit
(1,000,000 steps a pair) on 22 bench rosters: five templates and six seeded
20- and 40-person weeks, each built plain and with `--cover-price`.

| roster | pairs given up at 500 steps | pair hours at 500 | pair hours, run to the end |
|---|---|---|---|
| 20-person week 2, priced | 485 of 780 | 3,119 | 1,696 |
| 40-person week 0, plain | 308 | 1,832 | 327 |
| 40-person week 2, plain | 24 | 131 | 0 |

On the 20-person week, 262 of the 485 given-up pairs could in fact be covered.
On one 40-person week the capped count was 5.6 times the real one. A full walk
of every pair took at most a quarter of a second on any of the 22 rosters. The budget was
there to keep the priced pass fast, since the pass re-runs the walk for every
candidate move.

**The fix uses a pattern the product already has.** The single-call-out count
uses a budgeted search to screen moves, then keeps a move only if an unbudgeted
search agrees it pays. The pair price now works the same way. The 500-step walk
screens, a 200,000-step walk confirms, and the confirmed count is what the
output reports.

| week | old: moves, score added | confirmed: moves, score added | pair hours of the posted roster |
|---|---|---|---|
| 40-person week 0 | 29, +$11.69 | 11, +$5.69 | 8 either way |
| 40-person week 1 | 3, +$0.61 | 0 | 0 either way |
| 40-person week 2 | 8 | 0 | 0 either way |
| 20-person week 2 | 6 | 4, same score | 688 either way |

The confirmed pass reaches the same real pair hours with far fewer people
moved. On those weeks, every move it no longer makes was paying for pairs a full
count does not see. The confirm costs time on the big weeks (3.5 s to 8.2 s on
one), and that is one reason the pair price still runs only up to 120 shift
copies by default.

**I also tried a smarter search order and dropped it.** Handing out the most
constrained shift first is the textbook move for this kind of search. Here it
gave up on about as many pairs. It also changed the answer: a hand-over chain
may pass on a shift that the other caller's stand-in has just taken, so the
order decides which covers are reachable. Run to the end, it called 8 to 50
more hours clashing on 3 of the 22 rosters. The fixed order stays.

**The lesson:** a search that gives up and reports "at risk" is a safe upper
bound, but if you optimise against that bound, the optimiser will spend money
moving the bound rather than the risk. Screen with the cheap count, and decide
with the exact one.

All of this is on invented teams and seeded weeks, single runs on one machine.
The numbers are in the venture's README, "Fewer capped pairs", and in
`eval/pair-confirm.out.txt`, `eval/cover-pair-capped.out.txt` and
`eval/cover-pair-budgets.out.txt`. This is scheduling arithmetic, not
employment or legal advice.
