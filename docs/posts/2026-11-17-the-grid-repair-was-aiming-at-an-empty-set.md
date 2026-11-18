---
title: "The grid repair that never finished was aiming at an empty set: safety margins on an AC power flow"
seo_title: "Why an OPF repair stalls: safety margins that leave no AC point"
date: 2026-11-17
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "On PGLib-OPF case73 API, pulling thermal and voltage limits in by a small margin leaves no AC solution on PIPS or IPOPT, which is why the repair stalls."
---

The `grid-linopf` programme repairs a market's linear (DC) dispatch until it satisfies the AC power flow. Each round solves a QP on a linearised power flow. To leave room for the linearisation's error, the QP aims slightly inside every limit: 0.1 % below each branch rating, 0.001 pu inside each voltage band, 0.1 MVAr inside each reactive limit. On 31 of the 34 development cases from PGLib-OPF that finishes within 30 rounds.

An [earlier post today](2026-11-17-two-grid-repair-stalls-two-different-causes.md) found that one of the three cases that never finish, case73_ieee_rts in its congested (API) version, stops at a point where the QP can no longer lower the violation, and called it a local infeasibility of the repair's controls. But the AC optimum of that case exists, and it uses the same controls (unit outputs and generator voltage setpoints). So why can't the repair get there?

**Because the margins ask for something that doesn't exist.** The AC optimum of case73 API sits right on its limits. All 14 generator voltages are at the ceiling, 7 load-bus voltages are at the floor, and 10 branch ends are at their rating. We pulled every limit in by the repair's margins and solved the AC OPF again:

| AC OPF of case73 API | PIPS (PYPOWER) | IPOPT |
|---|---|---|
| limits as published | solved | solved |
| voltage margin only | solved, +1.99 % cost | n/a |
| thermal margin only | solved, +0.41 % cost | n/a |
| thermal and voltage margins together | **no solution** | **no solution** |

Neither solver certifies infeasibility, but both fail to find a point with both margins in place. The repair's last round agrees: it holds 14 setpoints at 1.049 pu (the shifted ceiling) and the lines at 99.9 % of their rating, with two load voltages still 0.002 pu low. The repair isn't trapped in a bad region. The target it was given has no point in it.

The other stall, case118 API, is different. Its margin-shifted OPF solves at +0.41 %, which fits the earlier finding that its steps are rejected by an acceptance test that scores the worst overload while the QP lowers the sum.

**Removing the margins doesn't help.** We ran the repair with the voltage margin at zero, the thermal margin at zero, and every margin at zero, on all 34 development cases. Neither stall finishes. With no voltage margin, case73 API ends with three voltages out of band by 1.00002 × 10⁻⁴ pu, just past the check's 10⁻⁴ tolerance: the repair walks to the edge and stops there. And the variants lose cases the normal repair finishes: 5 of 31 without the voltage margin, 16 without the thermal margin, 21 without any. The margins earn their place.

**Two things a practitioner can take from it.**

1. An empty margin-shifted set doesn't guarantee a stall. The shifted OPF has no solution on 4 of the 34 cases by both solvers, and the repair still finishes 3 of them, because its final check is against the published limits and it may leave a row within the check's tolerance. But when a repair does stall, solving the margin-shifted AC OPF once is a cheap test. If it has no solution, more rounds won't help, and the margin on one family has to come down.
2. Margins aren't free. At the shifted optimum, the 0.001 pu voltage margin alone costs +6.9 % on case57 API and +0.13 % on case14 API. The median over all cases is +0.08 %.

The predictions were written into the [log](../../research/infra-dcopf/LOG.md) before the run. Three held and five were refuted, including the two that expected removing a margin would finish a stall. A check rerun of the unchanged repair reproduced the recorded status sequences on all 34 cases. Next: a fallback that shrinks the margins on the failing pair only when the shifted set is empty, set on development cases and scored on the 24 held-out ones.

Code and numbers: [`run_margin.py`](../../research/infra-dcopf/experiments/run_margin.py), [`results_margin.txt`](../../research/infra-dcopf/experiments/results_margin.txt), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
