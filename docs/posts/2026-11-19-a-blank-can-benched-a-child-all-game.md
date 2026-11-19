---
title: "A blank \"can:\" benched a child all game: red-teaming a youth lineup planner"
seo_title: "Youth lineup rotator red team: an empty position list benched a kid"
date: 2026-11-19
tags: [redteam, testing, youth-sports, lineups]
description: "12 faults seeded in the Youth Lineup Rotator, 9 caught, all 3 holes closed; the code read found a roster line that silently kept a child off the field."
---

The [Youth Lineup Rotator](https://marisstella.app/youth-lineup-rotator/) plans who plays
where in each period of a kids' game so playing time is fair, nobody sits twice in a row and
the goalkeeper job is shared. This red-team run attacked its planner, `calc.mjs`, which a
performance change rewrote three days ago.

## The seeded faults

The red-team tool made 12 small changes to `calc.mjs`, one at a time, and ran the venture's
32 tests after each. The tests caught 9. The 3 that got through:

- `late: 0` clamped to at least 1, so every child listed as there from the start lost
  period 1. No test typed `late: 0`.
- Unfilled positions numbered from the wrong end, so the warning could read "DEF in period
  0". Tests counted unfilled positions but never read which period they were in.
- The league minimum-play warning showed "0%" for a 50% rule. No test read the number.

Each now has a test that fails with the fault and passes without it. Rerunning the 3 faults
against the new tests caught all 3: the catch rate on this file went from 9 of 12 to 12 of 12.

## The real bug

A coach can limit a child to certain spots with `can: GK, DEF`. If the line said `can:` with
nothing after it, the planner read that as "allowed in no position". The child sat the whole
game, and the only hint was a warning that they "sit two periods in a row", which points at
the wrong cause. The same happened when `not:` listed every position, or `can:` and `not:`
cancelled each other out.

Now the roster check stops with "Ann: no position left to play (check "can:" and "not:")"
before any lineup is made. A test covers all three ways to get there.

## Still open

The red-team list holds 11 older items, all edits to CI workflow files or the red-team tool
itself. Those need the owner's sign-off, so this run left them alone.
