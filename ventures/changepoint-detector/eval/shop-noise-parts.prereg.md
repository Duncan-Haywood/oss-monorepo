# Round 5: which part of the real shop's noise makes the watch quieter (pre-registered 2026-11-21, after round 4, before any round-5 shop ran)

## Why this round

Round 4 (`eval/shop-tails-closure.prereg.md`, output `eval/shop-tails-closure-sim.out.txt`) found that the Christmas
closure changes nothing (C1 fails: 71 against 72 of 100 x1.9 ramps caught), and that replacing the simulated noise with
the real shop's own residuals, drawn in blocks of 5 (`eval/shop-tails.mjs`), costs Quiet 20 catches (C2 passes: 52
against 72) and cuts its false alerts on unchanged shops from 1.93 to 0.70 per 100 checks. The real residuals are
*smaller* in spread than the simulated noise (sd 0.356 against about 0.42), so the cause is something else about them.
Three candidates, each removed on its own:

- **short-run correlation**: draw the residuals one at a time (blocks of 1) instead of blocks of 5;
- **skew** (a long low tail: 1% quantile -0.88, min -1.59, against +0.91 and +1.22 above): negate every residual;
- **the shape as a whole**: Gaussian noise with the real sd (0.356), no wholesale days.

## Simulation (`eval/shop-noise-parts-sim.mjs`, seed 20261122, fixed now)

Round 4's shop and ramp exactly (no Christmas closure), five noise families, each with 100 unchanged shops (N) and 100
x1.9 ramps (R90): **sim** (round 4's), **real5** (round 4's real, blocks of 5), **real1** (blocks of 1), **mirror**
(blocks of 5, each residual negated), **gauss** (`0.356 * N(0,1)`). One arm, Quiet (`model: 'mean'`, `--period 7`,
from day 74, the shipped default), caught as in round 4.

## Bars (R90 caught unless named)

- **E1 (round 4 replicates):** real5 <= sim - 15.
- **E2 (correlation is the cause):** real1 >= real5 + 10.
- **E3 (the low tail is the cause):** mirror >= real5 + 10.
- **E4 (the shape, not only the spread):** gauss >= real5 + 10.

Descriptive: alerts per 100 checks on N per family; median delay.

## What follows

Nothing in the product changes on this round alone: it says which feature a later fix must target. If E1 fails, round
4's C2 does not replicate and the README says so. If one of E2 to E4 passes alone, the README names that feature as
the cause of the real shop's quieter watch and the next round tests a fix aimed at it (for skew: reading revenue on a
log scale, which round 2 of the shut-weekday line found deafer on the real shop, so it must be re-tested, not assumed).
If none passes, the cause is an interaction, and the README says that.
