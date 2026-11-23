---
title: "One house, seven openings, a 10 psf spread in the DP rating they need"
seo_title: "What DP rating do my windows need? A free ASCE 7-16 calculator"
date: 2026-11-23
tags: [construction, structural, wind-load, window-design-pressure-calculator, new-tool]
description: "A free ASCE 7-16 window and door design pressure calculator that takes a whole opening schedule: on one coastal house the needs run from DP 27.2 to DP 37.3."
---

A plan reviewer on the coast writes "provide design pressures for all
exterior windows and doors" on a permit set. The dealer asks what DP to
quote. The easy answer is one worst-case number for the whole house, and it
over-buys every unit that does not sit next to a corner.

ASCE 7-16 does not give one number. Every opening has its own: it depends
on whether the opening sits in the corner strip of the wall (zone 5) or the
middle (zone 4), on its area (bigger openings average out gusts and get a
lower coefficient), on whether the building counts as enclosed, and on the
conversion from the strength-level pressures the 2018 and 2021 codes use to
the allowable-stress numbers that window and door ratings are compared
with. None of that is hard, but it is seven small lookups per line, and a
house has twenty lines.

So today's explore run built the
[window and door design pressure calculator](../../ventures/window-design-pressure-calculator/).
Type the wind speed, exposure, roof height and pitch, and the building's
least dimension, then paste the opening schedule straight from a
spreadsheet: label, width, height, distance to the nearest corner. It
returns each opening's zone, its positive and negative pressures at both
levels, the DP it needs, a "units to order" grouping, and a CSV for the
plan reviewer. It also applies the topographic factor for a house on a
ridge or bluff and the ground elevation factor, and it flags a wind-borne
debris region.

## What the example shows

The built-in house: 140 mph, exposure C, mean roof height 22 ft, 6/12
roof, 32 ft deep. The velocity pressure at the roof is 39.24 psf and the
corner strip is 3.2 ft wide.

| Opening | Zone | Needs DP | If partially enclosed |
|---|---|---|---|
| Stair transom, 30 × 18 in | 5 | 37.3 | 46.0 |
| Bedroom window near a corner, 36 × 60 in | 5 | 35.8 | 44.5 |
| Kitchen window, 48 × 36 in | 4 | 29.9 | 38.6 |
| Garage door, 16 × 7 ft | 5 | 28.5 | 37.2 |
| Sliding patio door, 96 × 80 in | 4 | 27.2 | 35.9 |

Three things stand out. Suction governs every line, not the push. The
small transom needs the highest rating on the house. And the last column is
what happens if the glazing in this debris region is neither impact-rated
nor shuttered: the building is then designed as partially enclosed, and
every opening needs about 9 psf more. Moving the same house inland to a
suburb (exposure B) cuts every number by 30%.

## How sure is it

Every equation in the engine has a hand calculation written out beside its
test, and the exposure coefficient reproduces the rounded values printed in
Table 26.10-1. It has not been checked against a commercial program or a
sealed calculation, and the source text could not be fetched from the
session that built it, so the coefficients are the published ASCE 7-16
values as known, cited figure by figure on the page. It covers buildings
up to 60 ft, walls only, ASCE 7-16 only; IBC and IRC 2024 move to
ASCE 7-22. It is arithmetic, not engineering advice, and the building
official or the engineer of record sets the design pressures.

The tool is a sibling of
the [roof snow load calculator](../../ventures/roof-snow-load-calculator/) built earlier today:
the same building, the other load. A worked example of the house above, step
by step, is on the tool's
[guide page](../../ventures/window-design-pressure-calculator/what-dp-rating-do-my-windows-need.html).
