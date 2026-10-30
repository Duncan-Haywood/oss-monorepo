---
title: "Where a shed's money goes: the skin, not the frame"
date: 2026-10-30
tags: [shed-designer, cost, estimating]
description: "Split by assembly, the default 8x12 shed spends 45% of its $3,026 of materials on siding, roofing, trim and paint, and 27% on the floor, wall and roof framing."
---

A builder looking at the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) said the frame was overbuilt: most members check at about 15% of their capacity. That's true, and worth fixing. But it raises a question the tool couldn't answer until today: how much of the bill is the frame?

The shopping list is grouped the way a store groups it (lumber, sheet goods, siding, fasteners). The new **Where the money goes** tab regroups the same lines by the part of the shed they build. A 2x4 board is often cut into studs, plates and blocking, so its price is shared among its pieces by length. The offcut and the spare boards are shared the same way. The groups add up to the shopping list's total to the cent, on every preset.

**The default 8x12** comes to $3,026.46 of materials at the 2026-10-29 store listings:

| Assembly | Cost | Share |
|---|---:|---:|
| Siding (T1-11 panels) | $514.60 | 17% |
| Roofing (shingles, underlayment, drip edge) | $456.84 | 15% |
| Fasteners and hardware | $420.41 | 14% |
| Wall framing | $295.35 | 10% |
| Floor | $293.83 | 10% |
| Doors, windows and vents | $251.83 | 8% |
| Trim | $248.05 | 8% |
| Roof framing and deck | $234.80 | 8% |
| Foundation and site | $160.81 | 5% |
| Paint and finish | $149.94 | 5% |

**What it says:**

- **The skin costs more than the frame.** Siding, roofing, trim and paint come to $1,369, or 45%. The floor, wall and roof framing, sheathing included, come to $824, or 27%.
- **Right-sizing has a ceiling.** All the untreated framing lumber in the shed is $500. Even if right-sizing the frame cut a third of it, that saves less than $170. The owner's $2,000 budget, against about $3,000 for this design before tax, has to come mostly from the skin, the openings and the hardware.
- **Fasteners and hardware are 14%.** That is $420: more than the wall framing. The 16d framing nails alone are $100.80 (four 5 lb boxes), and the fourteen variable-pitch rafter connectors are $89.46. Nobody would guess that from the board count. The nail count itself deserves a second look.
- **The presets differ more in the foundation than in the frame.** On the "8x12 classic" (gravel pad, 4x6 skids), foundation and site is $497, or 15%. On the default (solid blocks on tamped soil), it is $161, or 5%.

**Lap siding to match a house.** The owner wants horizontal lap siding painted to match their HardieBoard house, not T1-11. On the default 8x12, changing the siding to fiber-cement lap over OSB and painting it white adds $300 of materials:

- siding +$332 (the planks, plus the OSB they need behind them);
- paint −$58 (the line becomes paint instead of solid stain);
- fasteners +$26.

That sentence is now what the tool shows after any edit: "Last change: materials +$300 (siding +$332, paint −$58, fasteners and hardware +$26)". The option cards and the cheaper-build card say the same thing against your design.

**The bridge to the cheapest passing design.** The tab can also run the same-footprint cheaper-build search. It then draws a waterfall from your total to the cheapest design that passes every load and connection check. On the default 8x12, the search does four things: a 4" overhang, an OSB subfloor, LP SmartSide panels and 2x4 rafters. Together they save $138 of materials:

- floor −$42;
- roof framing −$36;
- siding −$35;
- trim −$21;
- wall framing −$5.

That is under 5%. Getting to $2,000 takes a different design, not a cheaper version of this one. That is the job of the pre-optimised designs other lanes are building.

The prices are store listings, linked line by line in the tool, and they change. The structure checks are a screening check, not an engineer's review.
