---
title: "Four of the five DC OPFs with no solution had one: a solver check on PGLib-OPF"
seo_title: "Why a DC OPF reports infeasible on PGLib-OPF: PIPS, x = 0 ties"
date: 2026-11-16
tags: [research, power-systems, optimal-power-flow, pglib-opf, dc-opf, grid-linopf]
description: "On 4 of 5 PGLib-OPF cases where PYPOWER's DC OPF had no solution, a second solver finds one. Zero-reactance bus ties and solver failures, not the networks."
---

The `grid-linopf` programme asks whether a market's linear (DC) dispatch can be repaired to satisfy the full AC power-flow physics in a few cheap steps. [Yesterday's run](2026-11-15-one-protocol-on-every-held-out-case.md) scored the frozen repair on 24 held-out PGLib-OPF cases. Five of them were never scored: the three SNEM networks (1,803 buses), case1951_rte API and case2000_goc API. On all five, PYPOWER's DC OPF reported no solution, with or without angle limits. That's odd. PGLib publishes a DC objective for four of those five, so its own solver found one.

**What we did.** We wrote the plan and four predictions down first ([log](../../research/infra-dcopf/LOG.md)). Then we checked each case's data: whether the total load fits between the summed generator minimums and maximums, and whether any part of the network is cut off. We solved the DC OPF under four susceptance conventions, and we ran an elastic LP that shows which limits would have to give. The first pass turned up something the plan hadn't covered. On case2000 API the elastic LP needed no slack at all, and an infeasible problem can't give that result. So we added a second solver: the same B-theta model on Clarabel, compared with PYPOWER's PIPS on every problem.

**What came out.** Across 144 problems (24 cases, three conventions, with and without angle limits), the two solvers agree within 1e-5 on all 89 that both solve. On **26**, PIPS reports no solution and Clarabel solves the problem cleanly. They never disagree the other way.

| Case | Why PYPOWER had no DC solution | What fixes it |
|---|---|---|
| case2000_goc API | PIPS fails; the MATPOWER-convention problem is feasible | a second solver (1.4147e6 $/h) |
| case1803_snem TYP, API, SAD | two in-service branches with x = 0 (bus ties at bus 101) make MATPOWER's b = 1/x infinite | x = 1e-4 pu on the ties, then a second solver (SAD only without angle limits, as in PGLib) |
| case1951_rte API | genuinely infeasible under b = 1/(x·tap): one rating row short by 1.61 MW | PowerModels' b = x/(r²+x²), which PGLib uses (+0.081 % on PGLib's value) |

Two predictions were refuted as written. We expected PowerModels' convention on PIPS to reproduce PGLib's numbers, and it solved none of the four. We expected thermal ratings to be the cause, and they are the cause on only one case. Data and topology are fine on all five. PIPS also missed angle-limited DC solutions on three cases that *were* scored (case500 API, case1888 API, case2000 SAD). On those, the protocol had silently started the repair from the angle-free DC dispatch.

**Then the repair.** We used the second solver's dispatch as the start, only where PIPS had failed, and ran the rest of the protocol unchanged:

- **case2000_goc API:** from a start with 69 overloaded branches (worst 185 %) and the slack 2,315 MW outside its limits, the 20-round repair ends with no overload and a single unit outside its reactive limit. The IPOPT voltage stage then makes it **fully feasible at +0.19 %** over PGLib's AC optimum.
- **case1951_rte API:** the repair ends with one branch at 104.5 % and one voltage out of band (+1.04 %). Its reactive stage did not finish within the 45-minute limit, so it counts as not clean.
- **SNEM:** the AC continuation could not take a single step. The same x = 0 ties make MATPOWER's DC power flow return NaN for 1,802 of the 1,803 warm-start angles. With the ties at 1e-4 pu for the warm start only (a variant added after the run), the AC power flow exists and then stalls at 75 to 84 % of load. Yesterday's RTE cases did the same, and there the stall was a voltage-collapse fold. We have not run the fold test on SNEM.

None of the five finishes within 20 rounds, so the pre-registered tally stays at **10 of 24**. With the reactive stage it moves from 12 to **13 of 24**.

**What it means.** A benchmark result that says "the DC OPF has no solution" needs a solver that can prove it. PIPS's failures are silent and one-sided: they look like infeasibility and they are not. In this run they made five cases look unscorable, and they changed the starting point on three more. The protocol now needs an LP/QP solver that returns an infeasibility certificate, plus a stated rule for zero-reactance branches. Every number in the held-out table should be rerun under it.

**Limits.** These are PGLib-OPF v23.07 cases modelled in PYPOWER, with no real grid data. The x = 1e-4 pu value for the ties is our choice and comes from no source. The SNEM API gap to PGLib's DC value (+0.55 %) is unexplained. The SNEM stall has not been diagnosed. The numbers are in [`results_dc_infeasible.txt`](../../research/infra-dcopf/experiments/results_dc_infeasible.txt) and [`results_dc_rescue.txt`](../../research/infra-dcopf/experiments/results_dc_rescue.txt).

*Written with AI assistance (Claude Code). The code is in [`research/infra-dcopf`](../../research/infra-dcopf); the programme is [`research/grid-linopf`](../../research/grid-linopf).*
