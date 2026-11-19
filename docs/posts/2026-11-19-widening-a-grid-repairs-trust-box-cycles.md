---
title: "Widening a grid repair's trust box fixes its empty QP, then makes it repeat the step it just rejected"
seo_title: "OPF repair: widening an empty QP's trust box makes it cycle"
date: 2026-11-19
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Re-solving an empty repair QP at the smallest workable trust box fixed all 94 empty QPs, but 68 of them were the QP just rejected. Net: fewer finishers."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP on a linearised power flow, inside every limit with a small safety margin and inside a trust box around the current point. When that "hard" QP has no solution, the repair falls back to an elastic QP that minimises overloads; when a step makes things worse, it is rejected and the box halves.

[This morning's step](2026-11-19-what-empties-a-grid-repairs-qp.md) found that on both development cases that never finish (PGLib-OPF case118 and case73, congested "API" copies), the trust box, not the margins, made the hard QP empty: on all 58 failed rounds, removing the box gave a solution. So the obvious fix is to widen the box only as far as needed. We froze that rule (rule E) and seven predictions in the [log](../../research/infra-dcopf/LOG.md) before running it.

**Rule E.** On a round whose hard QP fails, one linear program (HiGHS) finds the smallest scale *t* of the box with a solution, capped so no box grows past twice its first size. If *t* is above 1, the hard QP is re-solved at 1.1 *t*; otherwise the old elastic fallback runs. Everything else is unchanged. We scored it on the 34 development cases, then on the 19 held-out cases that reach the repair.

| | frozen repair | rule E |
|---|---|---|
| development: hard QPs that failed / fixed by the widened box | 112 / 0 | 112 / **94** |
| development finishers (of 34) | 31 | 30 |
| case73 API | never finishes | **clean at round 12, +3.26 %** |
| firings that rebuild the QP just rejected | | **68 of 94** |
| held-out finishers (of 19) | 10 | 8 |

**What worked.** The widened QP solved every one of the 94 times the rule fired. case73 API finishes for the first time with the full safety margins, at 3.26 % above the AC optimum. On held-out data, case500 SAD finishes for the first time (round 5).

**What broke.** Rejecting a step and halving the box is the repair's only memory, and rule E erases it. After a rejection the base point is the same, the box halves, and the smallest workable scale doubles to match. The rule rebuilds the same QP and proposes the same step, which is rejected again. case30 API and case200 API, which the frozen repair finished in 7 and 10 rounds, now repeat one step for 22 and 24 rounds. case118 API does the same from round 4 and still does not finish. Held-out, three finishers are lost the same way.

Three predictions held (case73 finishes, the median finishing round is unchanged where both finish, the widened QP solves on 90 % or more of firings). Three were refuted (case118 finishes, at most one development finisher lost, a held-out gain with no loss). One could not be scored: case73's QP never failed after round 2.

**Next.** The gains all came from firings in rounds 1 to 3, before any rejection. The next rule widens the box at most once per base point: after a rejected widened step, the old elastic fallback runs. By construction it cannot repeat itself.

Code and numbers: [`run_enlarge.py`](../../research/infra-dcopf/experiments/run_enlarge.py), [`results_enlarge.txt`](../../research/infra-dcopf/experiments/results_enlarge.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
