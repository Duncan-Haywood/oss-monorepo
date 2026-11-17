---
title: "Halving the safety margins finishes the grid repair that never finished, and costs nothing elsewhere"
seo_title: "OPF repair stall fixed: back off margins when the target is empty"
date: 2026-11-17
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "A rule that halves an AC repair's margins only when the margin-shifted OPF has no solution finishes PGLib case73 API and loses none of 31 finishers."
---

The `grid-linopf` programme repairs a market's linear (DC) dispatch until it satisfies the AC power flow. Each round solves a QP aimed slightly inside every limit, by a small margin. [This morning's step](2026-11-17-the-grid-repair-was-aiming-at-an-empty-set.md) found why one benchmark case, PGLib-OPF's case73_ieee_rts in its congested (API) version, never finished: with those margins applied, its AC OPF has no solution on either of two solvers. The target is empty. Removing the margins outright didn't help, and it lost 5 to 21 of the 31 cases the repair already finishes.

So we wrote down a narrower rule before running anything, along with seven predictions:

> Before round 1, solve the AC OPF with PIPS and with IPOPT. The solvers that succeed form a panel. If no panel solver can solve the margin-shifted OPF, halve every margin (at most three times) and use the first scale at which one can. Otherwise change nothing.

Since the rule changes nothing on most cases, only the cases where it fires need a rerun.

**Development cases (34, 30 rounds).** The rule fires on two:

| case | frozen repair | with the rule (margins halved) |
|---|---|---|
| case73 API | never finishes | **clean at round 8, +0.956 %** over the AC optimum |
| case24 API | clean at round 10, +0.711 % | clean at round 8, **+0.168 %** |

No finisher is lost, so the count goes from 31 to **32 of 34**. Two cases are still open. case300 TYP has no AC power flow at its start. case118 API has steps that its acceptance test rejects, because the test scores the worst overload while the QP minimises the sum.

One prediction failed: we expected the rule to fire on all four cases where both solvers had found no shifted solution. On case240 TYP and SAD neither solver finds one even at an eighth of the margins, so the rule declines. The frozen repair finishes both anyway.

**Held-out cases (19 of PGLib's 500 to 2,000-bus networks that reach the repair, 20 rounds).** The rule fires once, on case588 API. The repair finishes at round 19 either way, and the clean point costs +0.655 % over PGLib's published optimum against +0.868 %. No verdict changes, so the held-out tally stays at 10 of 24. An empty margin-shifted target turns out to be rare on these networks. It doesn't explain the nine held-out misses.

**Why the rule uses two solvers.** PIPS alone fails the shifted OPF on case179 SAD and case793 API, and IPOPT solves both. A PIPS-only rule would have fired twice on a solver failure rather than an empty set.

**What it costs.** The check takes one to eight AC OPF solves. That is seconds on the small cases and up to 57 minutes on case1354 API, where only IPOPT is in the panel, which is longer than the repair itself. So for a practitioner, run it when a repair stalls, not on every dispatch. If the margin-shifted problem has no solution, the margins have to come down, and more rounds won't help.

Neither solver certifies infeasibility. Here "empty" means two local solvers found no point. The held-out evidence for the rule is a single case.

Code and numbers: [`run_backoff.py`](../../research/infra-dcopf/experiments/run_backoff.py), [`results_backoff.txt`](../../research/infra-dcopf/experiments/results_backoff.txt), the [pre-registered plan and outcome](../../research/infra-dcopf/LOG.md), and the [programme page](../../research/grid-linopf/README.md). Written with AI assistance (Claude Code).
