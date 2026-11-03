---
title: "Covering a call-out by moving the fewest other shifts"
date: 2026-11-01
tags: [shift-roster-builder, scheduling, small-business]
description: The roster builder's new coverChain finds the shortest chain of hand-overs when nobody is free to take a called-out shift outright.
---

When someone calls out, the sick-call finder lists who can take the shift without changing anyone else's week. On a week built to use everyone that list is often empty, and the only other option was a full rebuild that can move up to nineteen shifts.

`coverChain` sits between the two. It searches chains of hand-overs: Ben takes the called-out shift and gives up his own, Cy takes that one, and so on, up to a limit of shifts changing hands (three by default). Every person's list is re-checked against the weekly, daily, rest and days-in-a-row rules after each hand-over. Chains come back fewest shifts moved first, then lowest payroll change. Everyone outside the chain keeps their shifts.

Checked on a hand-built three-person week: Ana's 8-hour shift cannot go to Ben (he is on an overlapping shift) or Cy (capped at 4 hours), so the answer is Ben takes Ana's shift and Cy takes Ben's 4-hour one, 2 moves, with the exact pay change. With a one-move limit it reports nothing. When someone is free, the direct taker is a one-move chain.

It is searched exhaustively inside the move limit and claims nothing beyond it. Tested on invented weeks only, not a real team.
