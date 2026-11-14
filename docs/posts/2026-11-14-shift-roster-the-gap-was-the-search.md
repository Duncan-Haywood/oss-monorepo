---
title: "The gap was the search: an integer program, a missed roster, and re-solving one day at a time"
seo_title: "Is the optimality gap the bound or the search? A shift scheduling case"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, optimization, operations-research]
description: "A 60-person week sat $30.11 above its proven lower bound. HiGHS showed a valid roster $0.36 above it, so the search was at fault. Re-solving each day as an assignment problem closes most of it in 2 seconds."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) proves its
rosters where it can. On its hardest bench week (60 people, 245 shift copies)
the earlier run's pay floor brought the unproven part of the score down to
$30.11, on a $19,119 pay bill. That leaves two possible explanations. The
floor could be loose: the true best roster sits near $30 above it and the proof
just can't show it. Or the search could be weak: a cheaper roster exists and
the engine never found it. Those call for different fixes, so this run checked
which one it was before changing anything.

**Asking an independent solver.** The floor comes from a linear program, and
that program can also be read as an integer program. A new script dumps it, and
HiGHS (through scipy) solves it to optimality in 78 seconds. The integer
optimum is only $0.78 above the linear one. So branching on the floor could
never close more than 78 cents of the $30.

HiGHS's roster also turned out to be valid under every one of the engine's own
rules, and the engine's own scorer puts it at $28.97 cheaper than the roster the
page posted, just $0.36 above the bound. The gap was the search.

**Why the search missed it.** The two rosters differ on 166 of 245 shift
copies. Most of that is equal shifts traded between people, which changes
nothing, but underneath it a few hours have moved from $18–20 staff to $10–16
staff. Each of those moves needs several swaps at once. The engine's pay polish
tries one move or one swap at a time, so it never sees them.

**Re-solving one day at a time.** Hold everyone's shifts on the other days
fixed and staff one day from scratch. If each person works at most one shift
that day, the week's score splits into one number per (person, shift) pair:
what that shift adds to the person's score given the rest of their week. Add
"leave it open" at the open-shift penalty, and staffing the day becomes an
assignment problem, which the Hungarian method solves exactly in milliseconds.
The new pass sweeps the days until none changes. Then it "kicks" the roster:
it re-solves a random day with costs jittered by about a third of the average
wage, sweeps exactly again, and keeps the result only when it scores less.

It runs only when the exact check leaves a roster unproven, with 2 seconds of
its own:

| 60-person week 0 | above the floor |
|---|---|
| before | $30.11 |
| day pass, 0.5 s | $10.46 |
| day pass, 2 s | $7.04 |
| day pass, 5 s | $7.04 |

On the 80- and 100-person bench weeks, where even coverage goes unproven in the
time budget, the same pass left 1 to 5 fewer hours open on 4 of 5 weeks.

**What didn't work.** The obvious idea was to round the linear program's
solution into a roster. But 210 of its 308 nonzero values are fractions, and
the rounded roster left 30 or more extra hours open. Starting the day sweeps
from it ended further from the floor than starting from the search's own
roster.

**What is still open.** That week still has $7.04 unproven, against a roster we
know exists 36 cents above the floor. Moves across two days, or a pair of
people's whole weeks, are the next step. All of this is on seeded synthetic
weeks on one machine. The method, scripts and outputs are in the README section
"Re-solving one day at a time".
