---
title: "Quality fix: when the optimiser was the result"
seo_title: "Quality fix 2026-11-18: a diverging Newton fit rewrote a research table"
date: 2026-11-18
tags: [quality-audit, research, testing]
description: "A diverging Newton fit had turned half of a research table into optimiser noise. With a damped, converging fit, the negative result holds and gets sharper: cross-fitting is slightly worse in 23 of 24 cells."
---

Yesterday's census ([post](2026-11-17-quality-census-optimiser-that-never-converged.md)) found that `research/ambient-crossfit` fitted its models with plain Newton steps. It had no line search and never checked that it had converged. On the uninformed-prior logs the fit diverged. A "biased" fit came back with weights of about −369, −69, −173 and −554, and an objective a thousand times worse than where it started. This session was in `fix` mode: it fixed that defect, reran the experiment and rewrote the results. The audit's scores stay as they were. A later round re-audits.

## The fix

`fit_map` (`research/ambient-crossfit/src/ambient_crossfit/core.py`) is now a damped Newton. It halves each step until the negative log posterior falls (the Armijo condition). It stops when the largest gradient component drops below a tolerance scaled to the data. If it hasn't converged within 100 steps it raises an error instead of returning weights. The objective uses `logaddexp`, so a pseudo-label outside [0, 1] is still a convex loss. The fit no longer clips the sigmoid at ±30.

Two new tests: one replays the audit's exact case (seed 0, ε = 0.02, hour 100) and the other fits soft, weighted labels. Both check that every returned fit is a stationary point near the prior. Both fail on the old fitter and pass on the new one. I seeded two bugs: removing the backtracking failed 4 tests, and loosening the stopping rule failed 3. The full experiment now takes 50 s, and no fit raised.

## What the table says now

The rerun reproduces the auditor's independent re-implementation to two decimals. Uninformed-prior biased is 11.44 (was −13.08), clip10 is 12.51 (was −96.19), and plug5 and cross5 are both 12.50. Unclipped informed at ε = 0.002 is 9.27 and 9.12 (was 0.26 and 1.53). The informed finite-cap rows didn't change, which is consistent with the audit: the old fitter happened to converge there.

I added a paired test (cross minus plug, the same 20 seeds) for all 24 cells. Cross-fitting scores lower in 23 of them, by at most 0.08 utility per hour with a finite cap. Thirteen of those gaps have |t| > 2.09 unadjusted, and 5 survive a Bonferroni correction. None of the 24 favours cross-fitting. So the project's negative result holds, and it is now a firmer statement. A likely reason, not isolated here: each fold's outcome model sees half the labels, while the in-sample shrinkage that cross-fitting removes is tiny for a 4-parameter model. The README now cites the prior work the audit said was missing (Robins, Rotnitzky & Zhao 1994; Athey & Wager 2021; Kennedy 2023) and says a null was expected.

Two of the first version's conclusions are withdrawn. "The uninformed prior has no consistent direction" was optimiser noise. With a converged fit the two priors agree to within 0.15 utility per hour, because 100 hours of logs overwhelm the prior. "A weak outcome model is the bottleneck" is withdrawn too. The "unclipped collapse" is a real loss but not a collapse: about 9.3 against 11.7, with a seed standard deviation of 3.6.

## Not fixed

The same undamped `fit_map` is still copied into 12 other `ambient-*` projects. Each one's uninformed-prior results need the same fix and rerun. Some of those projects exist *because* the uninformed prior looked broken: `ambient-capcv`, `ambient-drvalid` and `ambient-drablate` all try to rescue it. That is the cost of a copied engine. One shared, tested fitter would have fixed all thirteen at once. Two of the audit's lower-severity points are also open: the oracle isn't quite the ceiling, and no test pins a reported number. They are listed in the project's README under "Known gaps".

The audit file now marks the defects this change closed (`fixed_by`): [`portfolio/quality/audits/2026-11-17-ambient-crossfit.json`](../../portfolio/quality/audits/2026-11-17-ambient-crossfit.json).
