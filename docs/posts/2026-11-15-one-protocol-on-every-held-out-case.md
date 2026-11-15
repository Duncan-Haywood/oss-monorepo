---
title: "One protocol on every held-out case: 10 of 24, and nothing lost"
seo_title: "Repairing a DC OPF dispatch to AC feasibility on 24 PGLib-OPF cases"
date: 2026-11-15
tags: [research, power-systems, optimal-power-flow, pglib-opf, ipopt, grid-linopf]
description: "With one slack rule and IPOPT as reference, the frozen DC-to-AC repair is fully feasible on 10 of 24 held-out PGLib cases, 12 with a voltage stage. DC alone: 0."
---

The [`grid-linopf`](../../research/grid-linopf/) programme asks a narrow question. When a market clears with a linear (DC) optimal power flow, how often is the dispatch feasible once you apply the AC physics, and can a cheap repair fix it? Its test set is 24 PGLib-OPF cases of 500 to 2,000 buses. No rule, margin or budget was tuned on them.

The first tally on those cases, two days ago, was a patchwork. PIPS was the cost reference, and it fails on 11 of the 24 cases. The slack bus was wherever the case file or PYPOWER put it. Twelve of the 24 were left unscored. Since then we found two things. IPOPT matches PGLib's published optimum within 0.005 % wherever PIPS fails. And on the French RTE networks, the "voltage collapse" was a 15 to 30 MW slack unit forced to carry the whole network's losses ([this morning's post](2026-11-15-the-voltage-collapse-was-the-slack-bus.md)). A paper can't report a result that rests on a patchwork of diagnostics, so this run reran all 24 cases under one protocol, with its predictions committed before the run.

## The protocol

Every case gets the same steps:

1. Put the reference at the largest live unit.
2. Start from the DC OPF dispatch.
3. Walk load up to the full-load AC power flow.
4. Run the frozen 20-round repair. This is a successive linearisation over real power and voltage setpoints, with no constant changed.
5. Where the repair does not finish, run a voltage and reactive stage on IPOPT.

Costs are compared with PGLib's published objective.

## What it found

| | fully feasible, of 24 |
|---|---|
| DC dispatch as cleared | 0 |
| repair, 10 rounds (the original hypothesis) | 1 |
| repair, 20 rounds (the frozen budget) | **10** (Wilson 95 %: 0.25 to 0.61) |
| repair, then the IPOPT reactive stage | **12** |

The numbers are in [`results_heldout_slack.txt`](../../research/infra-dcopf/experiments/results_heldout_slack.txt).

Five of the 24 never start. Those are the three SNEM networks, case1951_rte API and case2000_goc API, where the DC OPF itself has no solution even with angle limits removed. Of the 19 that do start, 12 end fully feasible.

Moving the slack did no harm. We paired the new results with the old protocol's on the 19 cases it scored. The new protocol gains 3, the RTE cases, and loses none. On the 6 cases where the largest unit already was the reference, the run is identical to the old one round by round. So the warm start changes nothing where it shouldn't.

Five of the six predictions held. The one that failed was cost. Feasible points sit a mean **+0.50 %** above the AC optimum, with a median of +0.26 % and only 4 of 12 within +0.1 %. One case, case588 TYP, is at +2.12 %. The repair stops at its first feasible round, so its cost depends on the path it took. A cost phase after feasibility is still missing.

## The misses

The seven unfinished cases split into two groups. On case1354 the repair still has 1 to 4 lines over their rating, at 112 to 120 %. On case1888 TYP and SAD it ends with one bus out of voltage band, and on the two smaller SAD cases with angle and thermal misses. IPOPT's reactive stage finds no solution on any of the seven. The other open question is why the DC model has no solution on five networks, which is the next step.

All of this is modelled with PYPOWER, Clarabel and IPOPT on PGLib-OPF v23.07, not measured on a real grid. The plan and predictions were committed before the run, and they are in [`LOG.md`](../../research/infra-dcopf/LOG.md) next to the outcome. Written with AI assistance (Claude Code).
