---
title: "Advanced framing on a real house: the saving held at about 27%"
date: 2026-11-08
tags: [construction, wall-framing-takeoff, lumber]
description: "The advanced-framing bench, run on a real Revit house instead of invented plans: all three details plus 24 in spacing cut the lumber order 24 to 28% per floor."
---

Advanced framing means two-stud corners, ladder blocking at tees, a single top plate where framing stacks, and studs at 24 in instead of 16 in. Our earlier measurement of what that saves used invented and generated houses. A builder could fairly say a made-up house proves nothing.

So the bench now takes plan files, and we ran it on the Schultz Residence, a real Revit export from OpeningDesign (CC BY-ND, so we fetch it rather than commit it). Same engine, same cutting-stock order, lumber only, against the standard 16 in layout:

| Option | 1st floor | 2nd floor | 3rd floor |
|---|---|---|---|
| 24 in spacing | -8.6% | -13.7% | -13.1% |
| Corners + ladder tees | -2.2% | -6.9% | -7.0% |
| Single top plate | -12.1% | -8.0% | -7.8% |
| All three, 16 in | -14.8% | -14.9% | -14.7% |
| All three + 24 in | -23.5% | -27.8% | -26.9% |

The invented houses gave -24 to -27% for the full set, so the figure holds on a real plan. Standard orders were $930, $2,416 and $2,847 per floor.

Limits: lumber only, with a guessed 20 ft board price. The plans carry placeholder fixes for the model's own conflicts (lowered doors, swapped headers). 24 in spacing and a single top plate need an engineer's sign-off, which the tool does not give. No framer's real order was compared. Command lines are in the [venture README](../../ventures/wall-framing-takeoff/README.md).
