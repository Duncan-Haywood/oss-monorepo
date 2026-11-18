---
title: "How many pipe hangers does the bath group need?"
seo_title: "Pipe hanger and strap count for a plumbing rough-in takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, plumbing, takeoff]
description: "The plumbing rough-in takeoff now counts drain hangers and supply straps from the spacing you type, and adds them to the budget."
---

Pipe sticks and fittings are the part of a plumbing order everyone remembers. Hangers and straps are the part that gets bought at the last minute, at retail.

The wall-framing takeoff's `--plumbing` mode now counts them. Type `drainHangerSpacingFt` and `supplyStrapSpacingFt` (the figures your local code or your plumber uses; the tool builds in none) and it divides the typed drain and vent feet, and the hot and cold feet, by those spacings, rounds up, and prices the result with `hangerPrice` and `strapPrice` in the Plumbing section of the budget.

For 15 ft of drain and vent at a 4 ft spacing that is 4 hangers; 15 ft of supply at 2.5 ft is 6 straps. The tests check those hand sums. It has not been compared with a real plumber's takeoff, and one hanger per spacing over the total length is a floor: every fitting and direction change usually wants its own support.
