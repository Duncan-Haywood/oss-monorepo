# Pre-registration: a shock that starts before the date (anticipation) (2026-11-18)

Written after an exploratory simulation (hashed seed base 71000, 50 panels a cell, `eval/synth-anticip-explore.out.txt`)
and before the confirmatory one (fresh base **73000**, 400 panels a cell). Committed on its own before that run.

**Why.** README "Shocks that are not steps" ended: "Next: a shock that starts before the date (anticipation)". Two
things can start early. A covariate's shock (people move before a law takes effect): then part of the shock is inside
the window the synthetic control is fitted on, and the placebo warning's calibration (step, slope and pulse shocks all
from the date) may not carry over. Or the true effect itself (smokers cut down when a tax is announced, before it
binds): then the fit absorbs part of the effect, the gap after the stated date shrinks, and the test loses power.
Abadie (2021, section 6) advises backdating the intervention to the first point people could react. Nothing in the
CLI or the page says this today.

**Method** (`eval/synth-anticip-sim.mjs`, fixed by this file). Panels from the shipped generator, cell N1 (39 units,
19 points before the stated date, 12 after). Each unit gets Z and W (independent; W moves nothing). Covariate cells:
every unit moves by beta x Z from L points before the stated date on. Effect cells: the treated unit alone drops by 1
from L points before the stated date on. Each panel is scored at the stated date and backdated by 2 and by 4 points
(outcome-only fit, floored ratio, `covariateBalance` on [Z, W] with the shipped warning). The gap compared across dates
is the mean gap over the stated date's 12 points. Cells: A0 nothing; A2 covariate beta 1.0, L 2; A4 covariate beta 1.0,
L 4; E0 effect -1, L 0; E2 effect -1, L 2; E4 effect -1, L 4.

Exploratory (50 a cell), stated date: size 8.0% (A0), 2.0% (A2), 2.0% (A4); Z's warning fired 24% (A0), 10% (A2),
22% (A4); in A4 Z-warned p <= 0.05 9.1% vs 0.0%, mean |gap| 0.86 vs 0.43. Power: E0 56%, E2 32%, E4 28% at the stated
date; backdated by the true lead, E2 50%, E4 54%; backdated too far (E2 by 4) 34%; E0 backdated 46-48%. Mean gap over
the stated window: E2 -0.87 stated vs -0.99 backdated 2; E4 -0.61 vs -0.86 backdated 4.

## Bars (confirmatory, 400 a cell)

1. **Size.** In A0, A2 and A4, at every date (stated, backdated 2, backdated 4), the p <= 0.05 share is at most 10%.
2. **The warning, covariate shock 4 points early.** In A4 at the stated date: Z-warned mean |gap| at least 1.5x the
   unwarned panels', and the Z-warned p <= 0.05 share at least 5 points above the unwarned's.
3. **The warning, 2 points early.** Reported, two-sided: Z's warning rate in A2 at the stated date against A0's. If it
   is 5 or more points below A0's, the text says the warning fires less often when a covariate's shock starts just
   before the date (the fit sees part of it). Bar 2's two conditions are also reported for A2.
4. **Anticipation costs power.** E2 and E4 at the stated date: power at least 10 points below E0's at the stated date.
5. **Backdating wins it back.** E2 backdated 2 and E4 backdated 4: power at least 10 points above the same cell at the
   stated date, and the mean gap over the stated window nearer -1 than at the stated date.
6. **Backdating when nothing was anticipated.** Reported: E0 backdated 2 and 4 against E0 stated (the cost of
   backdating needlessly), and E2 backdated 4 (backdating too far).

**Decision.** If 4 and 5 hold, the CLI gains `--anticipation N` (the fit ends N points before the stated date, the
gap and the test read from there, the stated date kept as the label) and the CLI text and the page say that a
change people saw coming should be backdated to the first point they could react, citing this run. If 5 fails, the
text says anticipation costs power and backdating did not recover it. If 1 or 2 fails for A4, the warning text says
its calibration is for shocks that start at the date. 3 and 6 are reported either way. Real states are not refitted.
