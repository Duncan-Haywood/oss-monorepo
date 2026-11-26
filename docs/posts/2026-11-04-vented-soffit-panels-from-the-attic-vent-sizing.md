---
title: "How many vented soffit panels? From attic vent area, on any hip roof"
date: 2026-11-04
updated: 2026-11-26
description: "Turn the intake vent area an attic needs into vented soffit panels, by hand, for a rectangle and for an odd-shaped all-hip roof with several ridges."
tags: [wall-framing-takeoff, for-customers, construction, ventilation, soffit]
---

# How many vented soffit panels? From attic vent area, on any hip roof

*Written by an AI agent working in this repository.*

A soffit order has to say how many panels are the vented kind. To get that number you need the attic's intake vent area, and that comes from the ventilation rule. The steps are short enough to do by hand, and the wall-framing takeoff does them for you from the plan you already drew.

## The arithmetic

1. **Required net free area.** IRC R806.2 asks for 1 sq ft of net free vent area per 150 sq ft of attic floor. It allows 1 per 300 with a vapor retarder on the warm side, or with 40 to 50% of the area high and the rest low. Which ratio applies is for you and your inspector to decide.
2. **High and low.** With a ridge vent, half the area goes high by default. The ridge can only carry what fits along it: each ridge, less a gap at each end (12 in by default), times the vent's label net free area per foot. Whatever the ridge can't carry moves to the soffit.
3. **Vented panels.** Divide the low (intake) area by one vented panel's label net free area and round up. Every other panel in the soffit order is solid.

On the built-in sample house (a 40 x 28 ft gable) the intake area is 537.6 sq in. At 100 sq in per vented panel, 6 of the 8 panels in the order are vented. If the soffit has fewer panels than the intake area needs, the takeoff says so and suggests a higher-NFA panel or a continuous vent.

## An odd-shaped hip roof

Until 2026-11-26 this only worked when the roof could be framed: a rectangle, or an L, T or U plan. A plan drawn as a closed outline of square corners, such as a stair-step or Z plan, got its soffit and fascia but no vent sizing, and no vented panels. Now the sizing reads the all-hip roof on that outline:

- **Attic floor:** the footprint inside the walls.
- **Ridge vent:** every ridge of that roof, each less the end gap at both ends.
- **Soffit:** the whole eave line, because an all-hip roof has no rakes.

A worked example: a 30 x 30 ft stair-step plan (three 10 ft steps), 6 in 12, with 12 in eaves.

| Step | Figure |
| --- | --- |
| Footprint (attic floor) | 360 x 120 + 240 x 120 + 120 x 120 in = 600 sq ft |
| Required at 1/150 | 600 / 150 = 4 sq ft = 576 sq in |
| Half high | 288 sq in |
| Ridges | two, 10 ft each; less 1 ft at each end = 8 ft each, 16 ft in all |
| Ridge vent at 18 sq in/ft | 16 x 18 = 288 sq in, exactly the half asked of it (four 4 ft pieces) |
| Low (intake) | 576 - 288 = 288 sq in |
| Vented soffit panels at 30 sq in | 288 / 30 = 9.6, so 10 of the soffit's 12 panels vented, 2 solid |

On a plain rectangle, the outline route gives exactly the same figures as the framed hip roof on the same house. A test checks that, along with the stair-step numbers above.

## What it does not decide

You type the vent's net free area from its label, and you choose 1/150 or 1/300; the defaults (18 sq in per foot of ridge vent, 56 sq in per soffit unit) are placeholders, not any maker's figures. A ridge that ends on another ridge also loses its end gap, which is conservative. Gable, box and power vents are not counted, and neither are cathedral or spray-foam (unvented) roofs. Baffles are counted only when the roof has a rafter spacing. This is checked against hand arithmetic only, not against a real soffit or vent order.

Run it from the wall-framing takeoff with `--ventilation --eaves` on a plan with a roof outline, or try the free [attic ventilation calculator](https://marisstella.app/wall-framing-takeoff/ventilation-calculator.html) for a rectangle.
