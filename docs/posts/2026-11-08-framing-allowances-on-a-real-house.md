---
title: "Framing allowance rules against a real house: one is close, one over-orders by a quarter"
date: 2026-11-08
tags: [construction, lumber, wall-framing-takeoff]
description: "Two common stud-count rules of thumb set against a counted lumber order on a real three-floor house, with the numbers and what they do not show."
---

Builders often order framing lumber by a rule: one stud per foot of wall, or studs at the spacing plus a few more per opening and corner. Our takeoff counts the studs instead and buys boards from a cutting-stock plan. Until now we had compared the two only on invented and generated houses.

This run used the Schultz Residence, a real Revit model (OpeningDesign, CC BY-ND, fetched from the public IFC samples, not committed). Three wood floors, 49 walls, 530 ft of wall, at 16 in on centre:

| rule | lumber vs the counted order |
|---|---|
| one stud per foot + 3 plates, +10% waste | +3.1% (+1.6% to +8.2% by floor) |
| spacing + 4 per opening + 2 per corner/tee, +10% waste | +24.7% (+20% to +36% by floor) |

The first rule is closer than it was on the generated houses, because this house is mostly long plain walls. It ignores spacing, so at 24 in on centre it over-orders by 18 to 19% on every floor. The second rule over-orders on every floor.

Limits: one house, and the wall set uses placeholders the model needed (doors lowered to the floor, some headers swapped). The rules are our reading of common practice, not a standard, and no framer's real order was compared. The bench is `allowance-bench.mjs`, now run on plan files with `cli.mjs --fixed-plan`.
