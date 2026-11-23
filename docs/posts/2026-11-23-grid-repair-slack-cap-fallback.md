---
title: "Keep the safety margin, drop it only when it leaves no room: an OPF cost phase that is never worse"
seo_title: "OPF cost phase: margins kept, slack cap only on an empty QP"
date: 2026-11-23
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "On 83 PGLib-OPF runs, using the slack cap only when the margined QP is empty is never dearer than the margined cost phase and closes more of the AC gap."
---

The [grid-linopf](../../research/grid-linopf/README.md) programme repairs a linear (DC) dispatch until it passes every AC limit check. Then a **cost phase** looks for a cheaper safe point nearby: up to ten small QPs on the generator costs, accepting a step only if the full AC check is clean and the cost falls. The [first version](2026-11-23-grid-repair-cost-phase.md) (rule CP) cut the mean gap to PGLib's AC optimum from +0.39 to +0.23 points on development cases. A third of the cases never moved.

Earlier today a second rule (CS) tried to fix that. The QP keeps a small safety margin inside every limit, such as 0.1 % below each branch rating. A clean point that already sits inside that band, at 99.95 % of a rating, is outside the QP's own feasible set, so the QP is empty. CS capped every margin at the room the point actually had. Empty QPs fell from 185 to 10 of 803 rounds. But trials that left the safe set rose from 88 to 275. The margin had been absorbing the linearisation's error, and held-out cases got slightly worse.

**This run's rule (CF), fixed with its predictions in the [log](../../research/infra-dcopf/LOG.md) before anything was scored:** keep the frozen margins. Only on a round whose margined QP is empty, solve the same QP again at the same box with the capped margins, and score that trial like any other.

| frozen start, mean % over PGLib's AC optimum | clean point | CP (margins) | CS (cap always) | **CF (cap when empty)** |
|---|---|---|---|---|
| development, 31 cases | +0.391 | +0.229 | +0.218 | **+0.209** |
| held-out (500 to 2,000 buses), 10 cases | +0.577 | +0.508 | +0.516 | **+0.494** |

- **Never worse than the rule it replaces.** On all 83 finishing runs, two repair variants on two case splits, CF ends at or below CP's cost. It is cheaper on 28. From the frozen start on development, it is cheaper on 10 of 31 and dearer on none (sign test P = 0.002). On the 51 runs where CP never met an empty QP, the two are identical, as the rule was built to be.
- **The fallback is where the gains come from.** It fired on 183 rounds and 111 of those trials were accepted. Trials that left the safe set: 131, against CS's 275.
- **Held out, it beats both earlier rules.** It moves the cases CP could not move (case588 API from +0.868 to +0.791 %, case1888 API from +0.617 to +0.571 %). It keeps every gain CP made, for example case588 TYP at +1.917 % where CS gave back to +2.072 %.
- **It is not the best rule case by case.** On development, CS is still cheaper than CF on 18 of 31 cases, for example case14 API at +0.291 % against +0.409 %. CF's mean is lower because it does not give back CP's large wins on case179 SAD and case300 API.

All eight predictions held, including the adoption test set in advance (no higher mean gap than CP on both splits from the frozen start). CF replaces CP in the method of record: frozen repair, then the reactive stage, then the cost phase. The next step is to run that whole method on the 33 unused PGLib cases of 2,001 to 2,999 buses, with the rules fixed before it runs.

Code: `vlin.cost_phase(fallback=...)` and [`experiments/run_fallback.py`](../../research/infra-dcopf/experiments/run_fallback.py); numbers in [`results_fallback.txt`](../../research/infra-dcopf/experiments/results_fallback.txt). These are modelled results from PGLib-OPF v23.07 with PYPOWER power flows, not a measured grid. Written with AI assistance (Claude Code).
