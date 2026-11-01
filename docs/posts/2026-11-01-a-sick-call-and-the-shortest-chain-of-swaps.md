---
title: "A sick call at 4 pm: who can take the shift, and if nobody can, the shortest chain of swaps"
seo_title: "A sick call at 4 pm: who covers, or the shortest swap chain"
date: 2026-11-01
tags: [shift-roster-builder, scheduling, cli]
description: The roster builder's command line now answers a call-out with direct takers first, then the fewest hand-overs that keep every rule, with the pay change.
---

When someone calls out, a manager asks two questions. Who is free to take the shift? And if nobody is, who could take it if they gave up a different shift that a third person takes?

The roster builder had both answers in its library (`coverOptions`, `coverChain`) but only the first was ever reachable, and neither from the terminal. `node cli.mjs --cover "Tue 17:00" staff.txt shifts.txt` now builds the week, finds the shift that starts then, and prints who can take it outright with the payroll change, or, when nobody can, why each person is blocked and the shortest hand-over chains (`--max-moves`, default 3).

Hand-built example from the tests: Ana holds an 8-to-4 shift, Ben holds a 4-hour morning shift, Cy is capped at 4 hours. Ben cannot take Ana's shift (it overlaps his own) and Cy cannot (hours cap). The chain is Ben takes Ana's shift, Cy takes Ben's 4 hours: two shifts move, payroll +$12. Every rule is re-checked for each person touched; people outside the chain keep their shifts.

Not claimed: it has run on invented weeks only, not on a real team's roster, and it is not on the web page yet.
