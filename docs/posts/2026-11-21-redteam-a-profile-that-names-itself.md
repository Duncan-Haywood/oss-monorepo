---
title: "A steel profile that names itself: one real bug and ten escaped mutants in the IFC takeoff geometry"
seo_title: "Mutation testing an IFC quantity takeoff: 2 of 10 seeded bugs caught"
date: 2026-11-21
tags: [redteam, testing, mutation-testing, ifc-quantity-takeoff, ventures]
description: "Red team on the IFC takeoff: its geometry tests caught 2 of 10 seeded bugs, and a profile that names itself overflowed the stack. Both are now fixed and guarded."
---

Today's red-team run seeded faults into two files: `geom.mjs`, the 2,000-line
geometry kernel behind the [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/),
and `platform/ci/check_dst_day_step.py`, a CI lint that flags date arithmetic
that goes a day wrong across daylight saving.

## The geometry kernel: 2 of 10 caught

The takeoff's 155 tests run real models end to end, and they are good at
whole-file numbers. They reached the small pieces only through those files.
Of ten seeded bugs, two failed a test. Four of the eight escapes changed
nothing a user could see (a threshold between 0 and one full period, for
example, when the value is always a whole number of periods). The other four
were real gaps:

| Seeded bug | What a user would have seen |
|---|---|
| a Z section's corner moved from `tw / 2` to `tw / 3` | wrong area and weight for every Z purlin |
| a 2D transform's z axis `[0, 0, 1]` became `[0, 0, 2]` | double the volume of an item placed with a 2D operator |
| the ear clipper's cross product read `a[1]` for `a[0]` | concave faces cut with a triangle outside the face (an L-shape gave one of area -2) |
| a duplicate-point tolerance `+ 1` became `- 1` | repeated points kept in every profile under one unit from the origin, which covers most metre-unit files |

A new `geom.test.mjs` now catches all four.

## The real bug: a profile that refers to itself

Reading the code around one escape (a depth counter that started at 1
instead of 0 and changed nothing) showed why it changed nothing:
`profile()` passed its depth down and never checked it. An
`IFCDERIVEDPROFILEDEF` or `IFCCOMPOSITEPROFILEDEF` that names itself, one
malformed line in a file, recursed until the JavaScript stack ran out. The
takeoff survived, because each element is read inside a `try`, but the row
said `error: Maximum call stack size exceeded` instead of naming the problem.

Placements, curves, booleans and mapped items already stopped at a depth
limit. Profiles now do too, with the reason `profile nesting`. One test
builds a self-referring loop of each of the five kinds and expects each to
end unresolved, so a sixth recursive reader added later has a list to join.

## The CI lint: 5 of 8 caught

The daylight-saving lint's tests checked which lines it flags, but its
command line had only ever run on a clean tree. A seeded bug that made it
exit 2 instead of 1, and one that dropped the folder it was given and
scanned the clean default instead, both passed. A test now runs it on a
temporary folder with one bad file and expects exit 1 with that file named.
A third escape flagged plain timestamp sums that build no `Date`, and that
case is now in the accept list.

## The numbers

Across both files, 7 of 18 seeded bugs were caught before the fix. Four
escapes were equivalent. After the fix, all 14 that can change behaviour are
caught. The run also found and fixed one real defect.
