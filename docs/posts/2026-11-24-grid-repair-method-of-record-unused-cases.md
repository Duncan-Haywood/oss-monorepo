---
title: "On 33 grid cases no rule was tuned on, the cost phase makes all 18 finishers cheaper and none worse"
seo_title: "OPF repair cost phase confirmed on unused PGLib cases"
date: 2026-11-24
tags: [research, power-systems, optimal-power-flow, pglib-opf, grid-linopf]
description: "Rule CF, run once on 33 unused PGLib cases of 2,001 to 2,999 buses, cuts the mean gap to the AC optimum from +0.77 to +0.66 points and never loses to rule CP."
---

The [grid-linopf](../../research/grid-linopf/README.md) programme builds a cheap AC repair for the dispatch a linear (DC) optimal power flow produces. Its current method of record has three stages:

1. A successive-linearisation repair runs until the dispatch first passes every AC limit.
2. An IPOPT reactive stage takes the cases the repair leaves only reactive-limit short.
3. A cost phase, [rule CF](2026-11-23-grid-repair-slack-cap-fallback.md), then walks the clean point downhill without ever leaving the safe set.

Every rule in it was chosen on development and held-out cases of up to 2,000 buses. That leaves one question a reviewer will ask first: does it hold on cases nobody looked at while choosing?

The confirmation split is every PGLib-OPF v23.07 case of 2,001 to 2,999 buses: 11 networks in their typical, congested (API) and small-angle (SAD) versions, 33 cases. It was set aside on 2026-11-20. The repair finishes 10 of them, and the reactive stage 8 more. Today the cost phase ran on those 18. The [plan and seven predictions](../../research/infra-dcopf/LOG.md) were committed before anything was scored, and the older rule CP ran alongside it for comparison.

**What came out** (PYPOWER power flows, Clarabel QPs, gap to PGLib's published AC optimum):

| | clean point | rule CP | rule CF | CF cheaper / dearer than CP |
|---|---|---|---|---|
| finished by the repair, 10 cases | +1.322 | +1.182 | **+1.139** | 3 / 0 |
| finished by the reactive stage, 8 cases | +0.073 | +0.072 | **+0.065** | 7 / 0 |
| all 18 | +0.767 | +0.689 | **+0.662** | 10 / 0 (sign test P = 0.002) |

- **Every finisher got cheaper, and none got worse.** All 18 reruns reproduced their stored clean points first, the eight IPOPT reruns included. The median gap fell from +0.115 % to +0.089 %. The biggest single move was case2383wp_k API, from +0.285 % to +0.002 %, a case where rule CP takes no step at all.
- **CF's fallback matters most right after the reactive stage.** The cost phase had never run on a reactive-stage point before. Rule CP moves only 1 of those 8 points: on the other 7, all 10 of its rounds are empty QPs. That follows from how the point is made. IPOPT leaves voltages and reactive output sitting on their limits, and the frozen 0.1 % safety margin then puts the starting point outside the QP's own feasible region. CF re-solves an empty round with each margin capped at the slack that row already has, so it moves all 8. Over 180 rounds, CP hit 75 empty QPs and CF none.
- **One prediction failed.** I bet the repair finishers would end at a mean gap of +1.000 point or less. They ended at +1.139. One case, case2848_rte TYP, holds the mean up: it starts at +6.776 % and the phase only gets it to +6.208 %. Without that case the mean is +0.580. Six of the seven predictions held.

**What it does not show.** The cost phase needs a clean point to start from, so the 15 cases that never finish are untouched. Seven of them stall on heavy overloads. These are benchmark networks, not a measured grid, and the reference is PGLib's own AC objective. Next come those non-finishers, starting with case2869_pegase, which stalls 2 to 4 overloads short.

Numbers: [`results_confirm_cf.txt`](../../research/infra-dcopf/experiments/results_confirm_cf.txt), produced by [`run_confirm_cf.py`](../../research/infra-dcopf/experiments/run_confirm_cf.py). Written with AI assistance (Claude Code).
