---
title: "Moving 190 lines of statistics without moving a number: checking a refactor by its outputs"
seo_title: "Checking a statistics refactor by byte-identical outputs"
date: 2026-11-21
tags: [changepoint-detection, refactoring, testing, javascript]
description: "The changepoint detector's GARCH search and two linear solvers left its 2,500-line engine. How 360 seeded calls showed the move changed no result."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s `engine.mjs` had grown to 3,004 lines
by 2026-11-19. That day's quality audit marked it down for this: helpers copied across modules and one file
doing everything. An earlier session moved BOCPD, the CSV reader and the shared helpers out (down to 2,546 lines).
Today's session moved two more things:

- **The GARCH(1,1) search behind `--garch`** (the conditional-sd filter, the segment likelihoods for Gaussian and
  Student t noise, the forward cut search and its model choice) now lives in its own `garch.mjs`.
- **Two copies of the same linear solve.** The two-knot trend search and `lineRss` each ran their own Gauss-Jordan
  elimination with partial pivoting, line for line the same. They now share one `gaussJordan` in
  `stats-core.mjs`, next to `solveSym`, the Newton step's solver for the count trend.

The engine is now 2,354 lines. `engine.mjs` still re-exports every moved name, so no caller had to change.

## Why "the tests pass" was not enough

A numerical refactor can pass every test and still change results. Tests usually check a tolerance or a
changepoint's index, not the twelfth digit of a likelihood. Floating-point arithmetic is not associative either:
a solver that does the same algebra in a different order can return a different last bit. That can flip a close
call between two cut positions, and the flip only shows up on some series.

So the shared `gaussJordan` keeps the arithmetic order of the copies it replaces. It also keeps one detail that
differed between them: one copy gave up on a pivot under 1e-12 and the other never checked, so the helper takes the
tolerance as an argument. `solveSym` (elimination plus back substitution) was moved, not merged into
`gaussJordan`. Merging them would have changed its arithmetic.

## The check

A short script loads the engine as it stood on `main` and the moved version side by side. It runs both on 40 seeded
series of each kind: a trend with a bend and a step, a volatility step, and Poisson counts on a growing rate with
a step. For every series it compares the JSON returned by `lsKnots`, `lineRss`, `trendAdjust` (bends, and joint
knots), `poissonTrend`, `garchCuts` and `analyze` with `meanvar` plus `garch`, with `trend`, and with `poisson`
plus a bend.

360 of 360 calls returned byte-identical JSON. The full suite passed as well. One more thing the README's code
notes warned about: the self-deploy script copies a fixed list of modules into a deployer's own watch repository.
A new module left off that list ships a watch that cannot load. `garch.mjs` was added to the list, and
`watch-modules-closed.test.mjs` checks it.

## What is left

The roughly 300-line `analyze()` and the pre-steps (season, trend, AR(1) noise, holidays) are still in the engine.
They are next, and they will get the same before-and-after comparison.
