# Pre-registration: does the placebo warning hold the false finds when a covariate's shock is not a step? (2026-11-18)

Written after an exploratory simulation (hashed seed base 61000, 50 panels a cell, `eval/synth-shape-explore.out.txt`)
and before the confirmatory one (fresh base **63000**, 400 panels a cell). Committed on its own before that run.

**Why.** README "Which imbalance biases the gap" calibrated `placeboWarning` (the treated unit matched worse on a
covariate than at least 80% of the placebos are) on a covariate whose shock is a step at the date, and listed as a
limit: "their shocks need not be steps". "Two covariates" ended: "covariates with shocks that are not steps (a slope
from the date)". The CLI and the page quote the step calibration beside every warning, so a reader with a covariate
that moves the outcome gradually, or briefly, needs to know whether it carries over.

**Method** (`eval/synth-shape-sim.mjs`, fixed by this file). Panels from the shipped generator, cell N1 (39 units,
19 points before, 12 after). Each unit gets Z, which moves every unit by beta * Z * shape(h) at h = 0..11 points after
the date, and W, independent of Z, which moves nothing. Each shape averages 1 over the 12 points, so beta is the
average shift per unit of Z as in the step rounds. **slope**: (h + 1) / 6.5 (0.15 at the first point, 1.85 at the
last). **pulse**: 3 for the first four points, then 0 (a shock that fades). No true effect, so every gap after the
date is bias. Outcome-only fit, floored ratio (shipped defaults), then `covariateBalance` on [Z, W] with the shipped
warning. Cells: S0 beta 0; S1 slope 0.5; S2 slope 1.0; P1 pulse 0.5; P2 pulse 1.0. Bias is `effectAverage` (the mean
gap after the date); the gap at the last point (`effectAtEnd`) is reported beside it.

Exploratory (50 a cell): Z's warning fired in 20-26%; Z-warned vs not, mean |bias| 0.54 vs 0.20 (S0), 1.16 vs 0.45
(S1), 2.20 vs 0.70 (S2), 0.90 vs 0.37 (P1), 2.05 vs 0.65 (P2); p <= 0.05 among Z-warned 23% (S1), 31% (S2), 20% (P1),
0% (P2), and 0% among the unwarned in every cell; W alone: 0% p <= 0.05 everywhere.

## Bars (confirmatory, 400 a cell)

1. **Base rate and size.** In S0, Z's warning fires in 10-30% of panels; in every cell the p <= 0.05 share is at most
   10%.
2. **Slopes.** In S1 and S2: Z-warned mean |bias| at least 1.5x the unwarned panels', and the Z-warned p <= 0.05
   share at least 5 points above the unwarned's.
3. **Pulses.** (a) In P1 and P2: Z-warned mean |bias| at least 1.5x the unwarned's. (b) The same 5-point p <= 0.05
   line as bar 2, in P1 and P2.
4. **The harmless covariate.** In S2 and P2: the p <= 0.05 share of panels warned on W alone is at most 2 points above
   that of panels warned on neither.

**Decision.** If 1 and 2 hold, the README says the warning's calibration carries over to a covariate whose shock is a
slope from the date, and the CLI's warning text cites this run beside the step one. If 2 fails, the CLI text says the
calibration is for step shocks only. 3a decides the same for a shock that fades; 3b is reported either way (if it
fails because false finds are rare in pulse panels, the text says so: the warning then marks a biased gap more than a
false p). 4 is reported; if it fails, the CLI text's sentence on harmless covariates is widened to non-step shocks.
Real states are not refitted.
