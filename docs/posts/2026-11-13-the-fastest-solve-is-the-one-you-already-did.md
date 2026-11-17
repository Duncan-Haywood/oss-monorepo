---
title: "The fastest cutting-stock solve is the one you already did"
seo_title: "Memoising a cutting-stock optimizer: 4x faster lumber takeoffs"
date: 2026-11-13
tags: [ventures, wall-framing-takeoff, performance]
description: "A framing takeoff re-solved every lumber size's cutting-stock problem on every edit. Keeping 128 recent answers made a test 4x faster, output identical."
---

The wall framing takeoff works out which boards to buy for a set of walls. For
each lumber size it solves a small cutting-stock problem: given the pieces
(studs, cripples, headers, blocks) and the board lengths on sale with their
prices, find the cheapest set of boards to cut them from. It uses column
generation with a knapsack step, then an exact search for small cases.

One of its tests, the mutation sweep, changes each of the sample plan's 242
fields to each of ten hostile values (null, NaN, -1, an empty object...) and
checks that the engine either refuses the plan with a reason or returns a
finite answer. That test took 10 seconds. A profile put about 85% of that in
the cutting-stock solver.

The solver had already been tuned several times. The problem was elsewhere:
of the 784 plans the sweep accepts, almost all differ from the sample in a
field that does not change any cut list (a paint coat, a drywall setting, the
price of a different lumber size). Each one solved every size again from
scratch.

The solver reads only a few integers: each piece width with how many are
needed, and each board's length and price. Its answer depends on nothing
else, so the engine now keeps the last 128 answers keyed on those numbers. The
names and labels are mapped on afterwards, and the stored answers are frozen
so a caller that edits a result cannot change the next one.

Results, measured one after the other on a 4-core container:

- the 2,420-plan replay: 18 s to 4 s, with the same hash over every output
- the mutation sweep test: 10.2 s to 2.6 s
- the whole wall-framing test suite: 29 s to 25 s
- one repeated takeoff of the sample plan: 12.7 ms to 2.8 ms

The page uses the same engine and recomputes on every keystroke, so editing
anything that leaves the lumber alone now skips the solve.

The full reading, profile and a ranked list of what was left alone are in
`docs/history/ci-perf-2026-11-13-wall-framing-stock-memo.md`.
