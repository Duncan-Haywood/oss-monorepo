---
title: "How long are the hips and valleys on an L-shaped hip roof?"
date: 2026-11-26
updated: 2026-11-26
tags: [wall-framing-takeoff, for-customers, construction]
description: Hip, valley and ridge lengths and roof sheathing courses for an L-shaped hip roof, worked by hand at 4 to 12 in 12, for any square-cornered plan.
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

## Fascia and soffit under the same roof (added 2026-11-26)

The same plan gives you the fascia and soffit order. On a hip roof every side of the house has an eave, and there are no rakes. Each side's eave is the wall plus one overhang at every outside corner, minus one overhang at every inside corner. A square-cornered plan always has four more outside corners than inside ones. So, however stepped the plan is:

**eave length = wall perimeter + 8 × overhang**

Take the stepped 30 × 30 ft plan from the checks above: six outside corners, two inside, 120 ft of wall, and a 12 in overhang. The eave line is 120 + 8 × 1 = 128 ft. Side by side, that is 32, 12, four sides of 10, 12 and 32 ft. With 12 in soffit panels in 12 ft lengths, one course runs under each side. Each 32 ft side takes two whole panels plus an 8 ft piece, and each 12 ft side takes one panel. That leaves four 10 ft pieces and two 8 ft pieces, and no two of them fit in one 12 ft panel. So the total is 12 panels before waste. Fascia is the same 128 ft.

The takeoff now counts this for a plan outline the framing model can't split. It uses the same soffit, fascia, J-channel and frieze rules as the framed roofs. For a plain rectangle it gives exactly what the framed hip roof gives. It doesn't count corner mitres, drip edge, nails or caulk. It also doesn't split vented and solid panels under an outline-only roof yet, because the ventilation sizing reads a framed roof.

## Sheathing the same roof, course by course (added 2026-11-26)

Squares tell you how much roof there is, not how many sheets to buy. Sheets go on in 4 ft courses up the slope from the eave, long edge along the eave, and the hips and valleys change how long each course is. On every plane of a one-pitch hip roof:

- a course is the eave side's length, **minus one course's run at each hip end and plus one course's run at each valley end**, for every course you go up;
- one 48 in course covers 48 ÷ √(1 + (pitch/12)²) of run in plan: **42.93 in at 6 in 12** (45.54 at 4, 39.94 at 8, 33.94 at 12).

Take the L above at 6 in 12. Its long outside eave is 42 ft (504 in) with a hip at each end, so the courses run 504, 504 − 2 × 42.93 = 418.1, then 332.3 in, and a top strip about 30½ in wide. The two short inside eaves are 16 ft (192 in) with a hip at one end and the valley at the other. Their courses stay the same length all the way up: a piece has to reach the hip's line at the bottom of the course and the valley's line at the top, so each one needs 192 + 42.93 = **234.9 in** of sheet, cut on the 45 at both ends.

The takeoff now lays this out for any square-cornered plan. It works out each plane's exact shape from the same rule that gives the hip and valley lines. It splits each course into sheet lengths and cuts the pieces from whole 4 × 8 sheets with the same optimiser that cuts the lumber order. For the L:

| Pitch | Sloped area (sq ft) | Sheets if nothing were wasted | Sheets from the courses |
| --- | --- | --- | --- |
| 4 in 12 | 1,590 | 49.7 | 61 |
| 6 in 12 | 1,686 | 52.7 | 68 |
| 8 in 12 | 1,812 | 56.6 | 70 |
| 12 in 12 | 2,133 | 66.6 | 82 |

The course count is an **upper bound**. It doesn't reuse the triangles cut off at hips and valleys, and it doesn't pair a narrow top strip with a leftover from another width, so on a plan with many small planes it runs high. For example, it gives 38% offcut on the 30 × 30 ft stepped plan above. It also doesn't land end joints on rafters. For a plain rectangle it gives exactly the sheet count the takeoff's rectangular hip roof already gives, piece for piece. On 120 random plans, every point of the roof falls under a piece of its own plane's course.

The roof plan drawing now has every eave side dimensioned along the eave edge. The bid package we are building prints that drawing ahead of the quantities, so the customer sees the roof they are being quoted for.

## Where to use it

This is part of the estimating module we are building for the contractor suite, and it is not on the free framing page yet. Until it is, the multipliers above get you there by hand for an L, T or U. The free [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) already counts studs, plates, headers and the board order for the walls under that roof.

Quantities only, not engineering: hip and valley rafter sizes, bearing and connections are for your engineer or the local building department.
