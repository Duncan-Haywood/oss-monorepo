# shift-roster-builder: an early open-hours floor for the score LP's open-hours row (measured, not landed)

For the session that lands PR #15205, or the next one to deepen shift-roster-builder after it.

## What happened

Two sessions took the same flagship item within two minutes on 2026-11-12: the knapsack row (open
hours >= the lifted floor) in `bnp.mjs`'s whole-score master LP. #15205 claimed it first, so this
session yielded and moved to photo-editing. Its implementation was close to #15205's (a
coefficient-and-RHS generalisation of `solveLP`, a surplus column, the row's dual times the floor
in the dual objective). It had one piece #15205's diff does not, which is worth adding once #15205
lands.

## The piece: get the floor before the exact search, not from it

#15205 calls the row from inside `exactSearch` once the coverage passes have proved `minOpenH`.
On the two call-out weeks (sample café plus the spare part-timer, Cleo or Eli off Saturday),
those passes take about 16 s of the 27 s build. A much cheaper floor gives the same answer:

- `openFloorByColumnGeneration` (the open-hours LP alone, `ms: 1000`) gives root LP 1.5 h and floor
  2 h on both weeks within 1 s. `openSumLift(len, incOpen + 1)` lifts 2 h to 3 h (shifts of 3, 8
  and 10 h), which is the true least.
- The score column generation with `openFloor: 3` has root LP 304,070.57 (Cleo) and 304,005.02
  (Eli), each equal to the roster's own score. It proves at the root in 0.10-0.14 s, against a
  root LP of 154,105 without the row.
- Done in `buildRosterOnce` after the first score CG and before `exactSearch`, guarded by
  `Math.floor(cg.floor / BIG) < liftedFloor`, it lets `ex` take the proven branch and skip the
  exact search. Both weeks then build in 10.6-10.9 s instead of 27.0-27.6 s, status "improved"
  (proven), gap $0 against the bound, where they were "bounded" with $549-647 gaps. With
  `scoreOpenRow: false` both reproduce the old 27 s "bounded" results.

The remaining 8 s per week is the first score CG, which cannot close without the row. Running the
cheap floor before that first CG, and adding the row to it straight away, would likely cut the
weeks to about 2 s. Not measured.

## Tests that were written (in the patch, not landed)

- `solveLP` with coefficients and a right-hand side: min 3a + b with 2a + 5b - t = 4 gives 0.8,
  dual objective y.rhs = 0.8, and a right-hand side nothing can meet reports infeasible.
- 30 seeded tiny weeks, 2-3 people and 6-8 shifts: with the row at the brute-force least open
  hours, the score bound stays at or below the brute-force best and the root LP never drops.
  Negative result: on every one of those weeks the root LP was already integral, so the row raised
  none. Only the café weeks show the gap, so the raise is pinned there.
- The Cleo week: plain root < 160,000, row root = 304,070.57, `buildRoster` proven with
  `openRow.from = "column generation"`, about 11 s.

The patch was not pushed. This note and the numbers above are what is left of it. Re-deriving it
on top of #15205 is about 40 lines in `calc.mjs`.

Not done: the full venture suite was not run on that patch (it was stopped when the session
yielded), and the 20-60 person benches were not re-measured.
