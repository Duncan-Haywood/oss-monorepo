---
title: "Detail routing barely moved the ranking; a tool upgrade moved it a lot"
date: 2026-11-01
tags: [research, verified-dse, chip-design]
description: A detail-routed reference agreed with global routing in a chip-flow search study, but upgrading OpenROAD and Yosys reshuffled candidate rankings far more.
---

When you search for a good synthesis recipe, you score candidates with a cheap stage and a costly "routed" stage. Our verified-dse programme asked whether the cheap stages can be trusted. A standing worry was that the costly stage itself, a global-route estimate, was a poor stand-in for real detail routing.

Milestone 47 added detail routing and parasitic extraction on five small designs (250 points, SKY130, tight clock). Rank agreement (Kendall tau-b) between the global-route score and the detail-routed one was 0.65 to 0.93 (median 0.84); picking by the global-route score cost at most 1.2%. Extracted slack was 0.08 to 0.35 ns better than the estimate on every point. The conclusion that the mapped rung is biased at the tight clock stayed.

The surprise: re-running the same points under newer tools (OpenROAD 26Q3, Yosys 0.70 instead of 26Q2, 0.33) gave rank agreement with our cached results of only 0.28 to 0.56. Tool versions reshuffled the pool more than the router did, so regret tables should be quoted with their tool versions. Caveats: five designs, one corner, and the two tool changes cannot be separated. Details: `research/verified-dse/LOG.md`, milestone 47.
