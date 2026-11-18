---
title: "Flooring orders from room sizes: boxes, tile, grout and carpet seams"
seo_title: "Flooring takeoff: plank boxes, tile and grout, carpet from a roll"
date: 2026-11-05
tags: [wall-framing-takeoff, construction, flooring]
description: "The framing takeoff now counts finish flooring: plank boxes, tiles with thinset and grout, and carpet strips cut from a roll."
---

A house order has a long tail after the frame goes up. Flooring is a big line in it, and the arithmetic differs by material, so one "square feet plus ten percent" rule gets at least two of the three wrong.

The wall-framing takeoff tool now has `--flooring`. You type each room as a rectangle and a kind. Plank (hardwood, laminate, vinyl) sums the area, adds waste (more for a diagonal lay) and rounds up to whole boxes. Tile counts whole tiles from the tile size plus the grout joint, adds thinset bags, and works grout pounds from the joint's real volume: joint length, width, tile thickness and density. A 12 in tile with a 1/8 in joint over 100 sq ft comes out at 108 tiles and about 6.4 lb of grout, which the tests check by hand. Carpet is cut from a 12 ft roll along each room's long side, so a 14 by 13 ft room needs two strips and a seam, 29 linear feet of roll, where dividing the 182 sq ft by the roll width would say 15.

What is unproven: every default (box size, thinset coverage, grout density) is a typed figure, not a maker's label, and no real flooring order has been compared. It is not on the page or in the budget yet. Transitions, nosing and subfloor prep are left out and the output says so.
