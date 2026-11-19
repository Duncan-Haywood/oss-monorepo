---
title: "Widening a grid repair's trust box once per point stops the repeats, then a two-round cycle takes over"
seo_title: "OPF repair: once-per-point box widening still cycles"
date: 2026-11-19
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Allowing the trust-box widening once per base point removed all 68 repeated QPs, but a rejected-then-accepted two-round cycle still lost two cases."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP inside every limit, with a small safety margin, and inside a trust box around the current point. If that QP has no solution, an elastic QP that minimises overloads runs instead. A step that makes things worse is rejected, and the box halves.

[The last step](2026-11-19-widening-a-grid-repairs-trust-box-cycles.md) widened the box to the smallest size with a solution whenever the QP was empty (rule E). That fixed every empty QP, but in 68 of 94 firings it rebuilt the QP it had just rejected. After a rejection the point is the same, the box halves and the needed scale doubles, so the same step comes back.

**Rule E-once.** The same widening, at most once per base point. After a widened step, the old elastic fallback runs until a step is accepted and the point moves. We froze the rule and six predictions in the [log](../../research/infra-dcopf/LOG.md) before running it on the 34 development cases and the 19 held-out cases.

| | frozen repair | rule E | rule E-once |
|---|---|---|---|
| development finishers (of 34) | 31 | 30 | 31 |
| firings that rebuild the QP just rejected | | 68 of 94 | **0 of 43** |
| case73 API | never finishes | clean, round 12 | clean, round 12 |
| held-out finishers (of 19) | 10 | 8 | 9 |

**What it fixed.** Exact repeats are gone. case200 API, lost under rule E, finishes again, at round 7 instead of the frozen 10. Held-out, case588 TYP comes back, at 0.08 % above PGLib's objective instead of the frozen 2.12 %. case73 API (the first time it finishes with the full margins) and case500 SAD keep rule E's gains.

**What still breaks.** case30 API and held-out case793 API alternate to the end of their budgets. A widened step is rejected; then a tiny elastic step is accepted, and that tiny step moves the point and re-arms the rule. The elastic step is tiny because every rejection has halved the stored box (13 times on case30 API). The widening, though, is capped at twice the *first* box, which never shrinks. So it keeps proposing about the same large step from almost the same point. "Once per point" stops exact repeats and not near-repeats.

Four predictions held: at most one development finisher lost, case73 API clean, no slower median finish, and case500 SAD finishes. Two were refuted: a net development gain, and held-out finishers at least the frozen 10. The frozen repair stands.

**Next.** Tie the widening to the stored box: cap it at twice the *current* box, so each rejection also shrinks what widening can reach.

Code and numbers: [`run_enlarge_once.py`](../../research/infra-dcopf/experiments/run_enlarge_once.py), [`results_enlarge_once.txt`](../../research/infra-dcopf/experiments/results_enlarge_once.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
