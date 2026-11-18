---
title: "Valley flashing rolls now come out of the roof takeoff"
seo_title: "Valley flashing roll count for an L or T roof takeoff"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, roofing]
description: "A cross-wing roof has two valleys per wing. The wall-framing takeoff now turns their length into flashing rolls and a budget line."
---

An L- or T-shaped roof has a valley on each side of every cross wing, and each needs metal flashing. The `wall-framing-takeoff` roof module already worked out the valley length in feet; it just never became something to buy. It does now.

The count is valley feet times 1.1 for laps and end cuts, divided by a 50 ft roll, rounded up. Both numbers are typed defaults (`roofing.valleyWaste`, `roofing.valleyRollFeet`). The budget gets a "Valley flashing rolls" line priced by `valleyFlashingRoll`, and the price is listed on the page.

What this is not: it is checked against hand arithmetic only, not against a real roof's order. Gable and hip roofs with no wing have no valleys and show no line.
