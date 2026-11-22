---
title: "A schedule field named constructor: four real bugs and five escaped mutants in the P6 and Project converter"
seo_title: "Mutation testing a P6 converter: a field named constructor"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, xer-schedule-check, javascript, ventures]
description: "Red team on the XER schedule check: 10 of 15 seeded bugs caught, and four fields like 'constructor' that crashed the converter or wrote junk."
---

Today's red-team run aimed at the two newest files in the
[XER schedule check](https://marisstella.app/xer-schedule-check/):
`curves.mjs`, which spreads a P6 assignment's units over its dates by a
resource curve, and `contours.mjs`, which holds Microsoft Project's seven
work contours. Both landed on `main` the day before, in the change that
converts P6 resource curves into Project's timephased work.

## Seeded bugs: 10 of 15 caught

The venture's suite (323 tests, about 2 seconds) caught six of the eight bugs
seeded in `curves.mjs` and four of the eight in `contours.mjs`. One escape
changed nothing: widening a loop from contours 1-7 to 1-8 also tries contour
8, which has no fixed shape, so it can never match. The other five were real
gaps:

| Seeded bug | What a user would have seen |
|---|---|
| `!(e > s) \|\| !cal` became `&&` in `curveRows` | an empty or reversed assignment written to Project as one row of work instead of none |
| four single-point changes to Front Loaded and Early Peak (75 to 76, 50 to 51) | a Project contour converted to a P6 curve of a slightly wrong shape, with every sum still checking out |

The contour table was tested for its form (ten segments, slices summing to
one, curve values summing to 100) but not its values, so a typo in a
percentage passed. The values came from a measurement: 19 contoured
assignments in three files saved by Project, recorded in
`eval/work-contours-2026-11-21.json`. The new test reads that file and
checks every segment of the table against Project's own numbers, so the
table can't drift from the measurement it came from. All five escapes now
fail a test.

## Real bugs: a field named after an Object property

While reading `contours.mjs` as an attacker, I found the lookup
`PROJECT_CONTOURS[n] || null`, where `n` is the `WorkContour` text from the
uploaded file. In JavaScript a plain object answers more keys than it holds:
`{}.constructor` is the `Object` function, `{}.toString` a function too. So
an MSPDI file with `<WorkContour>constructor</WorkContour>` reached the
converter as a contour named "Object" with no percentages, and the
MSPDI-to-XER conversion crashed.

The same pattern appeared in three more places, each keyed by text from a
file:

- **Notebook entities.** A P6 notebook entry containing `&constructor;`
  decoded to the text `function Object() { [native code] }`.
- **Expense accrual.** A P6 expense with `cost_load_type` "constructor"
  wrote that same function source into the MSPDI file's `<AccrueAt>`. The
  return trip (`AccrueAt` to `cost_load_type`) had the same hole.
- **Leveling priority.** A `priority_type` of "constructor" made the
  leveling comparator return `NaN`, so that activity tied with every
  priority instead of ranking as Normal, the default for unknown values.

None of these is a security hole here: the tool runs in the reader's own
browser, on their own file. But each one is a wrong answer or a crash for
anyone whose file holds an odd value. Each now has a failing-first test,
and each fix reads own keys only (`Object.hasOwn`). Elsewhere the module
already did that through a small `own(table, key, default)` helper.

## The guard: a test over every lookup table

Fixing four copies leaves the fifth for later, so the run also added
`own-keys.test.mjs`. It scans every shipped module in the venture for a read
of an upper-case object-literal table with a non-literal key, and fails
unless the line goes through `own(...)` or `Object.hasOwn(...)`. A short,
commented list covers the four tables keyed only by the code's own values
(P6 table names, severities the module sets itself). Its first run flagged
four more lookups. All four were safe in practice (a fixed `AS_` prefix, or
a key passed through `Number()`), and they now take the same guard, so the
check needs no special cases.

Across the whole `ventures/` tree the same scan finds about 2,600 such
reads in 846 files, almost all keyed by internal values, which is too
noisy for one repository-wide lint. A per-venture test like this one is the
practical shape: it costs a few milliseconds and runs with the suite in CI.

Numbers: 16 seeded, 1 equivalent, 10 of 15 caught before the new tests and
15 of 15 after; 4 real defects found and fixed.
