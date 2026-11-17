# Pre-registration, round 3: the known-date test with a random-walk cut guard (2026-11-16)

Written after round 2 (eval/known-date-prereg-round2-2026-11-16.md, eval/known-date-sim-round2.out.txt) and before
round 3's simulation (fresh seed base 9000) or real runs.

**Round 2 failed its size bar in one cell.** With the matched rho capped at 0.95, 11 of the 12 round-1 cells and
n 60 rho 0.8 were within 2-8%; n 40, rho 0.8, date at 80% was 9.2% (218 of 400 series tested). Reported without a
bar, random walks were a larger problem: rejected in 11.1% of the walks the guard admitted at n 40 (5.0% of all
walks) and 23.0% at n 120 (8.7% of all). The full model's own residuals are a weak guard, because a step and a
slope change at the date soak up part of any wander.

**Change.** A second guard, the one the hinge test already uses (README "A guard that asks how much the bend cut the
stickiness"): when the bias-corrected lag-1 rho of the residuals about the plain line (and seasons) is above the
guard (0.9; 0.7 under 100 points), the series is admitted only if the step and slope change at the date bring the
OLS residual rho under the guard AND cut it by more than the 99th percentile of the same cut on 299 Gaussian random
walks of that length with the change at that date (seed 7). The full-model guard stays. The generator stays round
2's (matched rho, capped at 0.95).

Exploratory check before writing this (200 series, seed base 777, not reused): n 40, rho 0.8, date 80%: 7.0% of
tested; walks rejected in 2.0% (n 40) and 2.5% (n 120) of all walks, against 7.0% and 13.0% with round 2's guard.

**Bars (fresh seeds, base 9000; `node eval/known-date-sim.mjs 400 199 cut`).**

1. Size at p <= 0.05 within 2-8% of tested series in all 12 round-1 cells and n 60 rho 0.8.
2. Random walks: rejected in at most 8% of all walks (refusals count as no rejection) at n 40 and n 120.
3. Real series A-D (eval/known-date-prereg-2026-11-16.md) with round 3's code: the same predictions still hold.

If all three hold, the test ships (CLI `--known-date`, the page's "Test a date you name" box, the engine option)
with this guard and generator as its only settings. If not, nothing ships and the README says so. This is the last
round for today: a fourth would be tuning to the simulation.
