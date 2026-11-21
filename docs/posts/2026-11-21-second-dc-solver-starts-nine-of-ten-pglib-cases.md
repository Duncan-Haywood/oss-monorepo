---
title: "A second DC solver starts 9 of 10 PGLib-OPF cases the first one gave up on, and the AC repair finishes one"
seo_title: "Second DC OPF solver rescues 9 of 10 PGLib-OPF starts"
date: 2026-11-21
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "PIPS found no DC OPF start on 10 of 33 large PGLib-OPF cases. Clarabel starts 9; the frozen AC repair then finishes 1, so the split scores 10 of 32."
---

The `grid-linopf` programme asks how cheaply a market's linear (DC) dispatch can be repaired until it satisfies the full AC power-flow physics. Each run starts from a DC optimal power flow, raises the load to 100 % along a power-flow path, and then runs up to 20 rounds of a QP-based repair.

This morning's confirmation run, 33 PGLib-OPF v23.07 cases of 2,001 to 2,999 buses, left 10 cases unscored ([earlier post](2026-11-21-trust-box-widening-fails-confirmation-split.md)). PYPOWER's interior-point solver (PIPS) reported that their DC OPF had no solution, so the repair never ran on them. A check on another split had already shown that PIPS misses DC solutions a second solver finds. That made the 23 cases reaching the repair a property of the protocol, not of the networks.

**What we did.** Before running anything we wrote the plan and six predictions into the [log](../../research/infra-dcopf/LOG.md). We reran the 10 cases with the start rule from that earlier check, unchanged: PIPS first, and only where it fails, the same B-theta DC OPF on Clarabel, trying four network conventions in a fixed order. Everything after the start was the frozen repair, untouched.

**What came out.**

| | Cases |
|---|---|
| No DC start under PIPS | 10 |
| Clarabel returns a solution | **9** |
| Reach a full-load AC power flow | 9 |
| Repair fully clean within 20 rounds | **1** (case2742_goc API, round 15, +1.39 % over PGLib's AC optimum) |

All six predictions held. With the second solver, 32 of the 33 cases reach the repair, and it finishes 10 of them (31 %). Under the protocol's own start it finished 9 of 23 (39 %). So the start rule had been screening out mostly hard cases, not easy ones.

The eight cases that don't finish fall into three groups:

- **Reactive misses at tolerance level.** case2383wp_k TYP and SAD have no overload and no voltage out of band. They miss only because about 60 units sit outside their reactive limits, by 0.09 MVAr in total. The check's threshold is 0.001 MVAr per unit, so under the fixed rule they are not clean.
- **Near misses.** case2868_rte API ends with one branch at 100.01 % and five voltages up to 0.025 pu out of band. case2736sp_k API ends with two overloads, the worst at 105 %.
- **Thermal stalls.** case2312_goc API, case2746wop_k API and the two sdet cases end 20 rounds with 5 to 26 overloaded branches. The worst is 183 %.

The one case with no start at all, case2853_sdet API, is not proven infeasible. Clarabel stopped on iteration limits rather than certifying that no solution exists. Its units can produce 164 GW against 94 GW of load.

**What it means.** For a paper, the honest tally is both numbers: 9 of 23 under the protocol as fixed, and 10 of 32 with the second-solver start. The DC start matters more than any of the trust-box rules tried last week, which moved the count by one or two cases. The two case2383wp_k misses are the cheapest win left. Their only problem is reactive and tiny, which is exactly what the protocol's IPOPT reactive stage exists for.

**Limits.** That's one split, 10 cases, and one extra finisher. The reactive stage was not run here, and the missing start has no certificate yet. Both are the next steps.

Numbers: [`results_confirm_rescue.txt`](../../research/infra-dcopf/experiments/results_confirm_rescue.txt). Programme page: [`research/grid-linopf`](../../research/grid-linopf/README.md).
