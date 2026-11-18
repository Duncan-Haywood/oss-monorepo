# Pre-registration: with two covariates, does the placebo warning name the one that matters? (2026-11-17)

Written after an exploratory simulation (hashed seed base 51000, 50 panels a cell, `eval/synth-two-cov-explore.out.txt`)
and before the confirmatory one (fresh base **53000**, 400 panels a cell). Committed on its own before that run.

**Why.** README "Which imbalance biases the gap" calibrated `placeboWarning` with one covariate and ended: "a
two-covariate cell (one that matters, one that does not) to check the warning names the right one." The CLI's
synthetic control (`--donors ... --covariates`, this PR) prints a warning per covariate, so a reader will take the
warned name as the suspect. This checks whether that is fair.

**Method** (`eval/synth-two-cov-sim.mjs`, fixed by this file). Panels from the shipped generator, cell N1 (39 units,
19 points before, 12 after). Each unit gets Z, which moves every unit by beta * Z from the date on, and W, which moves
nothing. No true effect, so every gap after the date is bias. Outcome-only fit, floored ratio (shipped defaults), then
`covariateBalance` on [Z, W] with the shipped placebo warning (placeboShare >= 0.8). Groups: **Z warned** (with or
without W), **W alone** (W warned, Z not), **neither**. Cells: C1 beta 0.5, Z and W independent; C2 beta 0.5,
corr(Z, W) 0.7; C3 beta 1.0, independent.

Exploratory (50 a cell): W's warning fired in 20-32%; mean |bias| Z warned / W alone / neither was 0.88 / 0.43 / 0.54
(C1), 1.01 / 0.66 / 0.53 (C2), 2.17 / 0.78 / 0.75 (C3); p <= 0.05 in C3: 20% of Z-warned panels, 0% of the others.

## Bars (confirmatory, 400 a cell)

1. **W's base rate.** In C1 and C3, W's warning fires in 10-30% of panels.
2. **Bias follows the right name.** In C1 and C3: mean |bias| of Z-warned panels is at least 1.5x the neither group's,
   and of W-alone panels at most 1.25x the neither group's.
3. **False finds follow the right name.** In C3: the p <= 0.05 share of Z-warned panels is at least 5 points above the
   neither group's, and of W-alone panels at most 2 points above it.
4. **Correlated covariates.** In C2: mean |bias| of Z-warned panels exceeds that of W-alone panels.

**Decision.** If 1-3 hold, the README says that with independent covariates the warning names the one that matters,
and the CLI keeps naming the warned covariate. If 2 or 3 fails, the CLI's warning text gains a sentence that the
warned covariate need not be the one that moved the outcome, and the README reports the failure. 4 is reported either
way; if it fails, the CLI text says correlated covariates share a warning. Real states are not refitted.
