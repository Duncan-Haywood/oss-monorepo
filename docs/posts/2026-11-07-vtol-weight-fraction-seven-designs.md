---
title: "Seven NASA air-taxi designs say a cargo VTOL's airframe weighs 48 to 62% of takeoff weight, not 40%"
seo_title: "VTOL empty weight fraction: seven NASA concept vehicles checked"
date: 2026-11-07
tags: [aerolog-scaling, research, vtol]
description: "A hover-plus-L/D energy model reproduces NASA's fuel weights for two turboshaft air taxis; their non-energy weight fraction runs 0.48 to 0.62, well above our assumed 0.40."
---

Our battery cargo-VTOL sizing model assumed everything except energy and payload was 40% of takeoff weight. Checking it against NASA's published concept vehicles (Johnson, Silva and Solis, 2018) showed the energy half is fine and the airframe half is not.

The new step applies the same hover-plus-cruise-plus-reserve model to the two turboshaft designs, 3,831 lb and 11,654 lb. Dividing the published fuel by the model's shaft energy implies 0.616 and 0.591 lb/hp/h, 1.07 and 1.20 times the engines' published sfc. That is a plausible part-power penalty, though the reserve assumptions can move the ratio from 1.01 to 1.31, so the check is loose.

Across all seven designs (250 to 3,000 lb payload) the non-energy fraction sits between 0.48 and 0.62. I predicted battery-electric designs would fall outside the fuel designs' band; the electric quadrotor (0.583) is inside it, so that half was wrong. Only the electric side-by-side, with motors at less than half the turboshafts' weight per hp, is lower.

All seven are NDARC concept studies from one paper, so this checks a model against its source model, not flown aircraft. The next step is a real cargo VTOL's weights. Code and log: `research/aerolog-scaling/`.
