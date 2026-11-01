---
title: "Pricing a stair handrail by the foot in a framing budget"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, budget]
description: The framing takeoff's budget now prices the handrail run in linear feet from the stair's own rail layout, using a price you type.
---

A stair budget that counts balusters, guard posts and wall brackets but skips the handrail itself understates the job. The stair module already lays out the handrail: the pitch length, plus 12 in past the top riser and one tread past the bottom. The budget now turns that into feet.

Type `handrailFoot, 6.5` under `prices` (or on the page's price list) and a "Handrail" line appears under Stairs: total handrail inches across every flight with a rail, divided by 12 and rounded to a tenth of a foot, times your price. With no price typed the line is listed as unpriced and left out of the total, as with every other line. The tool ships no prices.

Checked by test against the stair engine's own handrail length (feet within one rounding step, amount equals feet times price). Not checked against a real rail supplier's catalogue, so treat the price as yours to supply. Guard rail boards were already in the lumber order.
