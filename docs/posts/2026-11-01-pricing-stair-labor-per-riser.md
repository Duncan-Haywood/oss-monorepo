---
title: "Pricing stair labor per riser in a framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, budget, construction]
description: The framing takeoff's budget now has a stair labor line, priced by the riser count the stair layout already knows, with your own typed rate.
---

Stairs were the one built element of the takeoff with lumber in the order but no labor line in the budget. Stair carpenters usually quote by the riser, so `laborStairRiser` multiplies the riser count the layout already computed by the rate you type.

A stair that splits at a landing counts both flights. Nothing is priced unless you type a rate: with no `laborStairRiser`, no stair labor line appears, and like every labor line it carries no tax or contingency. The tool ships no prices.

Checked by `budget.test.mjs`: a 108 in stair and a 200 in landing stair give a riser count the line's quantity matches, and amount equals quantity times the rate.
