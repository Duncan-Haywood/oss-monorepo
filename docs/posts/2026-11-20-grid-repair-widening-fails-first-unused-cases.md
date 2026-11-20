---
title: "A grid repair's trust-box widening, tested on 33 unused cases: two finishers lost, none gained so far"
seo_title: "OPF repair: box widening fails its first confirmation split"
date: 2026-11-20
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "On PGLib-OPF cases of 2,001 to 2,999 buses, widening rules C and P lose 2 of the frozen repair's 5 finishers and gain none. The frozen repair stays."
---

The `grid-linopf` programme repairs a linear (DC) market dispatch until it passes the full AC power flow. Each round solves a QP on a linearised power flow inside a trust box. When that QP has no solution, two candidate rules widen the box instead of taking the old elastic step: [rule C](2026-11-20-tie-the-widening-to-the-trust-box.md) caps the widening at twice the current box, and [rule P](2026-11-20-widen-the-trust-box-only-before-it-shrinks.md) also widens only before the first halving. Both gained one case on the development set and on the held-out set without losing any. A held-out case suggested rule P, though, so the held-out set could not confirm it.

**The test.** We took every PGLib-OPF v23.07 network from 2,001 to 2,999 buses, 11 networks with three variants each (typical, congested and angle-limited), 33 cases that no earlier step had touched. We fixed the protocol, the predictions and an adoption rule in the [log](../../research/infra-dcopf/LOG.md) before anything ran. Rule P would replace the frozen repair only if it gained more finishers than it lost and matched rule C.

**What came out so far.**

- The frozen repair reaches 23 of the 33 cases and finishes 9 within 20 rounds, at +0.04 to +6.78 % over PGLib's published AC optimum. The other 10 cases have no DC start under the protocol's DC solver. We already know that solver misses solutions a second solver finds, so that count says more about the protocol than about the networks.
- We have scored 11 of the 23 cases under both widening rules. The two rules behave identically on all of them. They finish 3 cases where the frozen repair finishes 5. They lose **case2848_rte and case2868_rte (typical)**, two large French networks that the frozen repair finishes at rounds 11 and 13, and they gain nothing.
- Both losses have the same cause. Each case has a single empty QP, on round 1. The widening fires there, before any halving, so rule P's guard never applies. The run then spends its 20 rounds with one bus voltage 0.003 to 0.005 pu outside its limit. On case1888 API the early widened steps did the reverse: they fixed voltages and left overloads behind.

| scored cases (11) | frozen | rule C | rule P |
|---|---|---|---|
| finishers | 5 | 3 | 3 |
| lost against frozen | | 2 | 2 |
| gained against frozen | | 0 | 0 |

**What this means.** The prediction that rule P loses no frozen finisher is refuted, and the remaining runs cannot change that. On the cases scored so far, the adoption rule keeps the frozen repair. The development and held-out gains were one case each, and they do not carry over to larger networks never used before. It is the kind of result a confirmation split exists to catch.

**What is unfinished.** The background job that ran rules C and P stopped at its 2-hour limit after 16 of its 40 runs. One 2,869-bus case took two hours per arm. The 12 cases still pending are cached as parts and will resume, and the summary lists them and leaves them out of every count. If they flipped the verdict, we would report that too.

Code and numbers: [`run_confirm.py`](../../research/infra-dcopf/experiments/run_confirm.py), [`results_confirm.txt`](../../research/infra-dcopf/experiments/results_confirm.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
