---
title: "Dormers now show up in the framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, budget, construction]
description: The framing takeoff's budget now lists a dormer's framing pieces, roof and cheek-wall sheathing, and labor from typed prices.
---

The takeoff could frame a gable or shed dormer, but the budget skipped it, so a bid built from `--budget` left the dormer out of the total.

Three typed prices fix that. `dormerMember` is one average price per framing piece, because dormer lumber is not in the cutting-stock order. `dormerSheet` prices sheathing for the roof and cheek walls, counted in 4x8 sheets with 10% waste. `laborDormerSqFt` covers framing and sheathing per square foot of roof plus wall. With no price typed, a line is listed as unpriced and left out of the total, and the tool ships no prices.

The test builds an 8 ft wide dormer and checks each amount against the quantity times the typed price by hand. It also checks that the lines stay unpriced when no prices are typed. Not done: cutting the dormer's lumber into the stock order, so the member price is a rough average and not an order cost.
