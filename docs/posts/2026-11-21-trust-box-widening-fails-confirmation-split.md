---
title: "A trust-box rule that helped on two PGLib-OPF splits lost on the third: the confirmation run"
seo_title: "Trust-box widening for AC repair of DC OPF fails its confirmation"
date: 2026-11-21
tags: [research, power-systems, optimal-power-flow, pglib-opf, negative-result, grid-linopf]
description: "On 33 unused PGLib-OPF cases of 2,001 to 2,999 buses, two trust-box widening rules finish 7 cases against the frozen repair's 9. Rules fixed in advance."
---

The `grid-linopf` programme asks how cheaply a market's linear (DC) dispatch can be repaired so it satisfies the full AC power-flow physics. The repair solves a sequence of small QPs inside a trust box. When a QP has no solution, the frozen method falls back to an elastic step. Over the last week we tried a different fallback: widen the box just enough to make the QP solvable. Two versions came out ahead on the cases they were tuned on and on a held-out set. Rule C caps the widening at twice the current box. Rule P does the same but only before the box has first been halved. Each was ahead by a single case, so neither gain was significant.

**What we did.** Before running anything, we wrote down a confirmation split nobody had touched, seven predictions and an adoption rule ([log](../../research/infra-dcopf/LOG.md)). The split is every PGLib-OPF v23.07 network from 2,001 to 2,999 buses, each in its typical, congested (API) and small-angle (SAD) version: 33 cases. Yesterday's run finished the frozen arm and 11 of the cases for the two rules, then hit the background-job time limit. Today we ran the remaining 12 cases for both rules from the cached parts, with nothing changed.

**What came out.**

| | Frozen repair | Rule C | Rule P |
|---|---|---|---|
| Cases that reach the repair | 23 | 23 | 23 |
| Clean within 20 rounds | **9** | 7 | 7 |
| Gained over frozen / lost | | 0 / 2 | 0 / 2 |
| Mean cost change where all three finish (7 cases) | | &minus;0.30 points | &minus;0.32 points |

Both rules lose case2848_rte TYP and case2868_rte TYP, which the frozen repair finishes at rounds 11 and 13. They gain nothing. Rule P never does better or worse than rule C on whether a case finishes. Under the adoption rule we fixed beforehand, the frozen repair stays.

The mechanism is simple. On 11 of the 20 cases where the repair ever meets an unsolvable QP, the only such QP comes at round 1. So both rules take the same single widening at round 1 and never widen again; only that first step differs from the frozen repair. That single widening costs two finishers: each run ends round 20 with one bus voltage 0.003 to 0.005 pu out of its band. It also makes one case (case2848_rte SAD) finish a round sooner and cheaper, at +0.23 % over PGLib's AC optimum instead of +0.70 %. The other 8 don't finish under any of the three arms. Rule P's guard only acts after a halving, so it can't prevent this.

**What it means.** Across the three splits, the widening rules net +1, +1 and &minus;2 finishers against the frozen repair. The gains we saw on the development and held-out sets didn't carry over to networks we hadn't used. That is exactly the case a confirmation split exists to catch. So we're closing the line as a way to finish more cases. One effect does hold up: where the widened runs finish, they finish slightly cheaper (case2312_goc SAD: +0.52 % against +2.33 %). That points at a separate cost phase after the run reaches feasibility, rather than at a different fallback.

**Limits.** 10 of the 33 cases never reach the repair, because the protocol's DC OPF (PIPS) finds no starting point. An earlier check found that PIPS misses DC solutions another solver finds, so that count belongs to the protocol, not to the networks. The next step reruns those 10 with a Clarabel DC start as a separate arm. Two gains and two losses over three splits are not significant evidence that widening hurts. It is enough to say the evidence that it helps did not survive.

Numbers: [`results_confirm.txt`](../../research/infra-dcopf/experiments/results_confirm.txt). Programme page: [`research/grid-linopf`](../../research/grid-linopf/README.md).
