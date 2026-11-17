---
title: "Two stalls of the grid repair, two different causes: a local infeasibility and a mismatched merit"
seo_title: "Why an SLP repair of a DC OPF dispatch stalls: two PGLib cases"
date: 2026-11-17
tags: [research, power-systems, optimal-power-flow, pglib-opf, convergence, grid-linopf]
description: "Logging the elastic QP penalty on two PGLib-OPF cases: one stall is a local infeasibility of the controls, the other a merit at odds with the QP."
---

The `grid-linopf` programme repairs a market's linear (DC) dispatch until it satisfies the AC power flow. Each round linearises the power flow, solves a QP inside a trust box, runs one AC power flow and keeps the step if a merit function fell. On 31 of the 34 development cases from PGLib-OPF it finishes within 30 rounds. Two of the three it does not finish, case73_ieee_rts and case118_ieee in their stressed (API) versions, get stuck on rounds where the hard QP has no solution, so the repair solves an *elastic* QP instead: it minimises cost plus 10⁴ times the summed violation of every limit.

Earlier today a [convergence statement](2026-11-17-what-a-convergence-proof-can-and-cannot-say-about-the-grid-repair.md) said when such a stall is a genuine dead end. If the elastic QP cannot lower its own penalty in any small box, the point is a stationary point of the infeasibility, and no number of extra rounds will help. The recorded traces could not test that, because they never logged the penalty. This run logged it, along with what the same QP achieves when its box is shrunk by 10, 100 and 1,000. The predictions went into the [log](../../research/infra-dcopf/LOG.md) before the run.

**The two stalls have different causes.**

| | case73 API | case118 API |
|---|---|---|
| What is left | two buses 0.002 pu below their voltage floor | two branches 0.2 to 0.3 % over their rating |
| Best decrease of the violation the QP can find, any box size | 8.8 × 10⁻⁶ (1.6 × 10⁻⁵ of it) | 5 % of it at the full box |
| Why the rounds fail | 14 of 33 voltage setpoints already sit on their upper limit, and the lines on their margins | the QP lowers the *sum* of overloads, and the merit, which scores the *worst* overload, rejects the step |
| Reading | a local infeasibility of the repair's controls | the acceptance test |

On case73 API the QP still returns a nonzero step in every box, the observation that led this morning's check to call the stall non-stationary. Logging the penalty shows that the step runs along directions that leave the violation flat. The morning's correction is withdrawn: the original "local infeasibility" reading was right, in the space of controls the repair is allowed to move (unit outputs and generator voltage setpoints; transformer taps and shunts stay fixed).

**One fix that does not work.** If the merit disagrees with the QP, why not accept elastic steps whenever the QP's own penalty falls? We ran that as a separate arm on all 34 development cases. Neither stall finishes. case118 API ends with one branch at 100.27 % instead of two at up to 100.22 %. No case is gained or lost, and one (case30 API) finishes a round later at a higher cost. So the acceptance test explains case118 API's rejected steps, but replacing it is not enough to finish the case.

**Predictions.** Three of the six held: the penalty falls on 20 of the 27 rounds the merit rejects, the linear model of the penalty is predictive on 42 of 58 elastic rounds, and the new acceptance rule loses no finisher. Three were refuted. The stall turned out to be near-stationary, and the penalty rule finished neither case. One prediction was simply wrong about the maths: the probe's decrease per unit of box size has to grow as the box shrinks, because the model is convex.

**What it means for a practitioner.** If a successive-linearisation repair stalls, check whether its controls can still move the violated quantity before giving it more rounds. On case73 API they cannot: the remaining low voltages need a control the repair does not have. Next steps: a merit that scores summed overloads the way the QP does, frozen on development cases and scored on the 24 held-out ones, and a run that adds taps or shunts on case73 API to test the infeasibility reading directly.

Code and numbers: [`run_elastic.py`](../../research/infra-dcopf/experiments/run_elastic.py), [`results_elastic.txt`](../../research/infra-dcopf/experiments/results_elastic.txt), the [programme page](../../research/grid-linopf/README.md) and the [theory section](../../research/grid-linopf/theory.md). Written with AI assistance (Claude Code).
