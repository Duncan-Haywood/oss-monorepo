---
title: "A shed on blocks needs anchors: the arithmetic"
date: 2026-10-30
tags: [shed-designer, wind, foundation]
description: "An 8x12 shed weighs about 1,800 lb without its shingles. Nothing in a skid-and-block plan holds it down, and wind on its long side tips it at about 7 psf."
---

Shed plans on skids and concrete blocks rarely say how the shed stays on them. The skids sit on the blocks, the blocks sit on the ground, and the shed's weight is all that holds it there. The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) now works out whether that is enough.

**The weight, counted low.** The tool knows every board and sheet it drew, so it can weigh them, using the NDS formula for the density of wood at a given specific gravity and moisture content:

- spruce-pine-fir at G 0.42;
- treated Southern pine at 0.55;
- panels at 0.42;
- all at 12% moisture.

Shingles, doors, windows, trim and hardware are left out. They add weight, so leaving them out is the safe side when weight is what holds the shed down. The starter 8x12 comes to about 1,800 lb.

**The wind.** The check takes the wind pressure you set (20 psf by default) on the whole face of the shed, from the bottom of the skids to the ridge, and also as uplift on the roof. It takes moments about the leeward line of skids and uses the allowable-stress combination 0.6D + 0.6W.

| Design | Weight (low) | Wind moment / weight moment at 20 psf | Tips at | Anchor at each windward corner |
|---|---|---|---|---|
| Starter 8x12 | 1,800 lb | 2.9 | 7 psf | 510 lb |
| 8x10 | 1,710 lb | 3.1 | 6 psf | 550 lb |
| 8x12 classic | 1,970 lb | 3.2 | 6 psf | 670 lb |
| 10x12 | 2,290 lb | 2.8 | 7 psf | 610 lb |
| 12x16 | 3,100 lb | 2.7 | 7 psf | 790 lb |
| 8x8 lean | 1,380 lb | 3.0 | 6 psf | 410 lb |

Every design tips at a small fraction of the default wind. That is not a quirk of these presets. A shed is a light, tall box with a big sail on each side, and the roof's uplift takes away much of the weight that was meant to resist the wind.

**What the tool says now.** Under the structure table, and as the last build step when it is needed, the tool gives the shed's weight and the pressure at which it would tip. It also says what an anchor at each windward corner must hold, and to put one on all four corners, because the wind can come from either side.

It does not pick the anchor. Ground anchors are rated by their makers for particular soils, and that rating is what to check against the number.

**Caveats.**

- The pressure is one figure for the walls and roof. ASCE 7 splits it by zone, and the roof's real uplift is usually somewhat less than the wall pressure, so this errs high.
- The counted-low weight errs low.
- Sliding is not checked, and neither are the blocks, which sit loose.
- It is not a pass/fail row in the structure table. The plans have no anchors in them yet, and a row every design fails would leave the tool's design searches with nothing to choose from.

This is screening with stated assumptions, not an engineer's review, and the plans are not engineered or code-checked.
