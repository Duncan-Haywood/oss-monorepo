---
title: "How many nails hold a shed's rafter ties? It depends on the width"
date: 2026-10-29
tags: [shed-designer, framing, structure]
description: "The shed designer said three 16d per rafter tie for every shed. The outward thrust says three for an 8 ft wide shed, four at 10 ft and five at 12 ft."
---

In a gable roof built on a ridge board, the ridge board holds nothing up. Each pair of rafters leans together, and its weight pushes the bottoms outward. A rafter tie across the pair at the wall plate stops that push, and the nails at each end of the tie, the heel joint, take all of it.

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) told everyone to use three 16d nails into each rafter, whatever the size of the shed. So we worked the joint out.

**The push.** For a pair carrying w pounds per foot over a span L, with the ridge h above the tie, the outward thrust is wL²/8h. With rafters 24" apart, 15 psf of roof dead load and 30 psf of snow:

| Shed | Pitch | Thrust per pair | 16d commons needed |
|---|---|---|---|
| 8 ft wide | 6/12 | 374 lb | 3 |
| 10 ft wide | 6/12 | 468 lb | 4 |
| 12 ft wide | 5/12 | 666 lb | 5 |

**The nail.** A 16d common is 0.162" by 3-1/2". Through a 1-1/2" tie into a rafter, both spruce-pine-fir, its allowable load in shear works out at about 120 lb by the NDS yield-limit equations, the formulas behind the NDS nail tables. For snow, that rises by 15% to 138 lb.

Three nails are enough on the 8 ft sheds and too few on the wider ones. The tool now works the joint out for each design. It puts the count in the build instructions and in the nailing schedule on the details sheet, and adds the nails to the shopping list. On a 12x16 that adds one 5 lb box of nails.

Steeper roofs push less, because h grows. Heavier snow pushes more. Your local code's heel-joint table is the one your inspector will use, and it can differ from this. The tool is a screening aid, not an engineer.
