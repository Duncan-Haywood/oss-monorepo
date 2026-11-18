# Pre-registration: does covariate imbalance pick out biased synthetic-control gaps? (2026-11-17)

Written after an exploratory simulation (hashed seed base 41000, 50 panels a cell,
`eval/synth-bias-explore.out.txt`) and before the confirmatory one (fresh base **43000**, 200 panels a cell).
Committed on its own before that run.

**Why.** README "Covariate balance of the outcome-only fit" found California's synthetic control 1.66 sd poorer
than California and ended: "the 0.25 flag is a convention, not a calibrated bar, and four states cannot say whether
imbalance predicts a biased gap; a simulation where a covariate drives the outcome after the date would."

**Method** (`eval/synth-bias-sim.mjs`, fixed by this file). Panels from the shipped generator, cell N1 (39 units, 19
points before, 12 after, idio sd 0.5). Each unit gets a covariate Z; from the date on, every unit moves by beta * Z.
The treated unit has no effect of its own except in B5/B6. Each panel: outcome-only fit, floored ratio, placebo pool
'without' (the shipped defaults), then `covariateBalance` on Z. Two candidate warnings:
- **flag**: |standardised gap| > 0.25 (the shipped `imbalanced`);
- **share**: placeboShare >= 0.8 (the treated unit matched worse on Z than at least 80% of the placebos are).

Cells: B0 beta 0; B1 beta 0.5; B2 beta 1; B3 beta 0.5 with the treated Z at 1.8; B4 beta 0.5 with Z partly the
loadings; B5 = B3 plus a true step of -1; B6 = B5 with beta 0.

Exploratory (50 a cell): the flag fires in 76-100% of panels, 76% even in B0 where Z does nothing. The share warning
fires in 16-22% of B0-B2 and B4, and every false p <= 0.05 in B1, B2 and B4 fell in its group (27, 13 and 13% against
0%), with mean |bias| 2.2-2.6x the rest. B5 found the true effect in 0 of 50 panels; B6 in 52%.

## Bars (confirmatory, 200 a cell)

1. **The 0.25 flag is not selective.** In B0, the flag fires in at least 50% of panels.
2. **The share warning picks biased panels.** In each of B1, B2 and B4: mean |bias| among share-warned panels is at
   least 1.5x the rest's, and their p <= 0.05 share exceeds the rest's by at least 5 points.
3. **The share warning's base rate.** In B0 it fires in 10-30% of panels (about 20% if the treated unit's rank among
   the placebos is uniform).
4. **Size survives the shock overall.** p <= 0.05 in at most 10% of panels in each of B0-B4.
5. **An imbalance can hide a real effect.** B5's p <= 0.05 share is at most half of B6's.

**Decision.** If 2 and 3 hold, `covariateBalance` gains a `placeboWarning` field (placeboShare >= 0.8) and the README
recommends it over the 0.25 flag, which stays as a description; if 1 holds, the README says the 0.25 flag fires on
most outcome-only fits whether or not the covariate matters. If 2 or 3 fails, nothing new ships in the module and the
README reports the failure. 4 and 5 are reported either way. Real states are not refitted: their balance is already
printed (`eval/synth-balance-real.out.txt`); the README will say which states the chosen warning marks.
