---
title: "Is a global-route score a fair stand-in for detail routing on bigger chip designs?"
seo_title: "Global route vs detail route on larger SKY130 designs"
date: 2026-11-01
description: "On a 16-bit multiplier and two 64-bit adders, global-route timing ranks synthesis sequences like detail routing does (tau 0.93); the mapped score picks 12% worse."
tags: [verified-dse, research, chip-design, openroad]
---

The [verified-dse](../../research/verified-dse/) programme uses a global-route score with timing repair as its "routed" reference when it tests cheap stages for picking synthesis sequences. The worry: real flows detail-route, so is the reference biased? Earlier milestones checked five small designs. This one checks the larger set: a 16-bit multiplier and two 64-bit adders, 24 pass sequences each, tight clock, OpenROAD 26Q3 with detail routing and OpenRCX parasitics (71 usable points, 0 DRC violations).

Result: Kendall tau between the global-route score and the detail-routed score is 0.93 on the multiplier and the 64-bit lookahead adder (1.00 on the ripple adder, which has only six distinct scores). Picking by the global-route score costs 0.0% against the detail-routed optimum on all three. The mapped-netlist score, with no wires, picks 12.0% worse on the lookahead adder and 3.9% on the multiplier, so the earlier "the mapped rung is biased at the tight clock" finding holds against the detail-routed reference.

Detail-route slack is more optimistic than the global-route estimate on every point (median +0.39 ns here, +0.19 on the small designs), so absolute periods in earlier tables are pessimistic; rankings are what carry over.

Caveats: three designs, pools of 24, one clock and corner, no multiple-comparison correction. The 24 and 32-bit multipliers were left out: one detail route of the 16-bit multiplier took 220 to 280 s with four jobs. Data: `research/verified-dse/experiments/detail_route/results_large.txt`.
