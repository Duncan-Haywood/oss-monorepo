---
title: "Which input decides when a hybrid cargo VTOL beats a battery one?"
date: 2026-11-08
tags: [research, aerolog-scaling, vtol, sensitivity]
description: "A global sensitivity run on a cargo VTOL sizing model: the battery's peak power, not its energy density, decides the break-even range."
---

Earlier milestones of the `aerolog-scaling` programme found, one sweep at a time, that a cruise-sized hybrid cargo VTOL beats a 250 Wh/kg battery aircraft beyond a break-even range of roughly 35 to 47 km. Which input moves that range most? This run draws all twelve inputs together and ranks them.

Over the ranges swept, the break-even has a median of 40 km (10th to 90th percentile 22 to 70 km). The pack's peak power (800 to 3,000 W/kg) alone explains about 53% of the variance; engine specific power adds 19%. Pack energy density explains 2 to 3%, and the non-energy mass fraction almost nothing, because it shifts both aircraft together. Two of my three predictions were wrong: I expected energy density to rank near the bottom and the non-energy fraction near the top.

Limits: the ranges are my own plausible sweeps, not datasheet values (the data hosts were unreachable), only first-order effects are computed, and the model's earlier limits stand. Code and numbers: `research/aerolog-scaling/experiments/vtol_sizing/global_sensitivity.py`.
