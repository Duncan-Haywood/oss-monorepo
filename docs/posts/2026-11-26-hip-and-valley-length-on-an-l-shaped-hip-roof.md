---
title: "How long are the hips and valleys on an L-shaped hip roof?"
date: 2026-11-26
tags: [wall-framing-takeoff, for-customers, construction]
description: Hip, valley and ridge lengths for an L-shaped hip roof, worked by hand at 4, 6, 8 and 12 in 12, and how the takeoff finds them for any square-cornered plan.
---

If you order hip and ridge cap, valley flashing or hip rafters off a plan, you need three numbers: the ridge length, the hip length along the slope and the valley length along the slope. On a rectangle there are textbook formulas. On an L, a T or a stepped plan, most people sketch the roof by hand. This post works one L-shaped house through by hand, gives the multipliers so you can check your own, and says what the framing takeoff we are building now does with any square-cornered outline.

## The one multiplier you need

On a hip roof where every plane has the same pitch, every hip and every valley runs at 45 degrees in plan. So measure its **run** along one wall direction (how far it travels in x, or in y, which is the same distance), then multiply:

| Pitch | Hip or valley length per foot of run | Common rafter per foot of run |
| --- | --- | --- |
| 4 in 12 | 1.453 | 1.054 |
| 6 in 12 | 1.500 | 1.118 |
| 8 in 12 | 1.564 | 1.202 |
| 12 in 12 | 1.732 | 1.414 |

The hip factor is √(2 + (pitch/12)²): √2 for the 45-degree diagonal in plan, plus the rise. The common factor is √(1 + (pitch/12)²), and roof area is plan area times that factor.

## A worked L-shaped house

The walls are a 40 × 40 ft square with a 16 × 16 ft corner cut out, so each leg of the L is 24 ft wide. The eaves overhang 12 in all round, so the eave line is a 42 × 42 ft L with 26 ft wide legs. All of the lengths below are measured to the eave line.

- **Hips.** The L has five outside corners. From each one, a hip runs up at 45 degrees until it meets the hip from the next corner or a ridge. Each leg is 26 ft wide at the eaves, so every hip covers half of that: **13 ft of run**.
- **Valley.** The one inside corner sends a valley up at 45 degrees toward the middle of the roof. It also covers **13 ft of run**, ending where the two ridges meet.
- **Ridges.** Each leg's ridge runs down the middle of the leg, from that meeting point to where the leg's end hips meet: 28 − 12 = **16 ft each**, 32 ft in all. Ridges are level, so no multiplier applies.

At 6 in 12 that gives 5 hips × 13 ft × 1.5 = **97.5 ft of hip**, 13 × 1.5 = **19.5 ft of valley** and **32 ft of ridge**. The roof area is (42 × 42 − 16 × 16) = 1,508 sq ft in plan × 1.118 = **16.86 squares**. The highest point is 13 ft of run × 6/12 = **6.5 ft** above the eave edge, measured on the roof planes (add your rafter depth and heel).

| Pitch | Squares | Ridge (ft) | Hips (ft, 5 of them) | Valley (ft) | Peak above eave (ft) |
| --- | --- | --- | --- | --- | --- |
| 4 in 12 | 15.90 | 32.00 | 94.44 | 18.89 | 4.33 |
| 6 in 12 | 16.86 | 32.00 | 97.50 | 19.50 | 6.50 |
| 8 in 12 | 18.12 | 32.00 | 101.63 | 20.33 | 8.67 |
| 12 in 12 | 21.33 | 32.00 | 112.58 | 22.52 | 13.00 |

Those figures come from the takeoff engine, and every one of them can be checked with the arithmetic above.

## When the sketch gets hard

An L, a T or a U still works on paper. A stepped plan, or two wings joined by a narrow link, is where hand sketches go wrong. Some hips there do not start at an eave corner at all. They start higher up, where a ridge meets a valley. And a narrow link gets a low ridge of its own, while each wing rises to a separate peak.

The takeoff now handles any square-cornered outline. It moves every eave line inward at the same rate, which is what a single pitch means: the roof at height h is the outline shrunk by h ÷ (pitch/12). Each outside corner traces a hip, and each inside corner traces a valley. Wherever two facing eaves meet, they leave a level ridge, and the roof may split into separate peaks there. The result is every ridge, hip and valley with its ends and heights, plus their lengths along the slope.

How it was checked:

- by hand on a rectangle, a square, an L, a U and two squares on a narrow link;
- on 300 random square-cornered outlines, against a brute-force roof: every line's height matches the roof surface along its whole length, and the ridge, hip and valley totals match an independent count of the creases;
- with deliberate bugs planted in the code, which the checks caught.

It has **not** been compared against a roofer's measured roof yet. It also assumes one pitch on every plane and level eaves: no gables, no dormers and no mixed pitches.

## Where to use it

This is part of the estimating module we are building for the contractor suite, and it is not on the free framing page yet. Until it is, the multipliers above get you there by hand for an L, T or U. The free [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) already counts studs, plates, headers and the board order for the walls under that roof.

Quantities only, not engineering: hip and valley rafter sizes, bearing and connections are for your engineer or the local building department.
