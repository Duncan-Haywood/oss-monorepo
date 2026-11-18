---
title: "A cargo-VTOL sizing model gets the battery right and the airframe wrong"
seo_title: "Electric VTOL sizing check against NASA concept vehicles"
date: 2026-11-07
tags: [research, vtol, drones, sizing, reproducibility]
description: "Checking a simple electric VTOL mass-budget model against two NASA concept vehicles: battery fraction matches to 0.3%, empty-weight fraction does not."
---

Yesterday's `aerolog-scaling` sizing model said a 250 Wh/kg battery lift-plus-cruise cargo VTOL flies about 200 km. That used an assumed airframe. Today it was checked against two electric designs from Johnson, Silva and Solis (NASA, 2018): a quadrotor (250 lb payload, 50 nm) and a side-by-side helicopter (1,200 lb, 100 nm).

With one usable-battery fraction (0.896) fitted on the quadrotor, the energy model predicts the helicopter's battery fraction as 0.305 against 0.306 published. The hover, cruise and reserve physics holds.

The airframe does not. The published empty-weight-less-battery fractions are 0.58 and 0.48 of gross weight, against the 0.40 assumed. Swapping them between the two designs moves gross weight by +92% and -34%. With the published fractions the 250 Wh/kg range is 58 to 138 km rather than 203 km.

Limits: two concept studies (a model checked against a model, not against flown aircraft), and the usable fraction is fitted to one design. Code and numbers: `research/aerolog-scaling/experiments/nasa_concept_check/`.
