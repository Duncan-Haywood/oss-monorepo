---
title: "How much attic vent does a roof need? The 1/150 rule, worked"
date: 2026-11-01
tags: [construction, roofing, estimating, open-source]
description: Net free area for an attic under IRC R806.2, split between ridge and soffit, worked on a 40 x 28 ft house. Now a command in the wall-framing takeoff tool.
---

A roof estimate usually stops at shingles and rafters. Attic vents are the line
people forget until the inspector asks for them.

The model code (IRC R806.2) asks for **1 sq ft of net free vent area per 150 sq
ft of attic floor**. It relaxes that to 1/300 when a vapor retarder sits on the
warm side of the ceiling, or when 40% to 50% of the area is high in the attic
and the rest low. Which one your house uses is for you and the inspector. The
arithmetic is the same either way.

## A 40 x 28 ft house

- Attic floor: 40 x 28 = 1,120 sq ft.
- At 1/150: 1,120 / 150 = 7.47 sq ft, or **1,075 sq in** of net free area.
- Half high, half low: 538 sq in each.
- A ridge vent labelled 18 sq in per foot needs 538 / 18 = 29.9 ft, which fits in
  the 40 ft of ridge once you stop a foot short of each end. That is eight
  4 ft pieces.
- The low half, in 56 sq in soffit units, is 10 units. A 16 in unit takes 10 x
  16 in = 13 ft of eave, and the house has 84 ft.

Net free area is what the product label says after the screen takes its share,
so never use the frame's raw opening. Those two label figures, 18 and 56, are
typed placeholders in the tool, not any maker's numbers.

## In the tool

`node cli.mjs plan.json --ventilation` reads the roof already in the plan and
prints the above. A hip roof can vent only along its short ridge, so the tool
hands what the ridge cannot supply to the soffit and says so. If the soffit
cannot take that many units it tells you to use a higher-NFA unit or add gable
vents. It also counts one baffle per rafter bay at the eaves.

It is hand-checked arithmetic (four tests in `ventilation.test.mjs`), not yet
checked against a real vent order, and has no page yet. It is part of the open
[wall-framing takeoff](../../ventures/wall-framing-takeoff/README.md), which is
MIT licensed.
