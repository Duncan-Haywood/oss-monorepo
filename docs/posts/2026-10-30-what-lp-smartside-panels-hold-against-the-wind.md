---
title: "What LP SmartSide panels hold against the wind"
date: 2026-10-30
tags: [shed-designer, wind, structure, siding]
description: "LP's own product report rates its panel siding as a shear wall. Read the footnotes and a 3/8 inch panel on spruce studs braces a shed about as well as T1-11, and the 7/16 inch panel 22% better."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) checks each wall as a shear wall: the wind on one face of the shed is carried to the ground by the walls parallel to it, through the siding nailed to the studs. T1-11 and the OSB under lap siding have values in the AWC's wind design standard (SDPWS 2015, Table 4.3A). LP SmartSide panels are not in that table, so until now a SmartSide shed got no racking check at all. That mattered more than it sounds: the tool's own "bring the price down" search picks the 3/8" SmartSide panel for the default 8x12.

LP's figures are in APA Product Report PR-N124 (revised July 2, 2026), Table 1, which LP hosts on its site. Getting from the table to a number for a shed takes four footnotes:

1. **The values are already allowable.** SDPWS gives nominal values you divide by 2.0. PR-N124's are allowable stress values, and footnote 3 lets you multiply them by 1.4 for wind.
2. **The table is for Douglas fir or Southern pine.** Footnote 1 takes 0.82 of the value for framing with a specific gravity from 0.42 to 0.49. Store studs are spruce-pine-fir at 0.42.
3. **A shiplap edge counts as a thinner panel.** Footnote 5: a 3/8" panel nailed through its shiplap edge takes the 5/16" row, and a 7/16" panel takes the 3/8" row. On a shed every panel joint is a shiplap joint, so those are the values that apply: 180 plf for the 3/8" panel and 220 for the 7/16".
4. **The joint is double-nailed.** Footnote 6: one nail goes through the underlap and a second through the full thickness, both at the edge spacing.

So the 3/8" panel is 180 x 1.4 x 0.82 = **207 plf**, the same as T1-11 to the pound. The 7/16" panel is 220 x 1.4 x 0.82 = **253 plf**, 22% more. On the default 8x12 at 20 psf, the gable walls carry 48 lb per foot. That is 23% of the 3/8" panel's value and 19% of the 7/16" panel's.

All 11 designs in the optimised gallery still pass. The rating holds only with the nailing it was tested with, so the build steps now give it:

- 8d galvanized nails at 6" on every edge, none in the grooves;
- each shiplap joint double-nailed;
- on studs at 24", the 7/16" panel nailed at 6" in the field too, which the joint ICC-ES/APA report ESR-1301 asks for.

The extra nails are on the shopping list as well. They add two 1 lb boxes ($11.14) to the 7/16" panel shed at 24", and nothing to the 3/8" shed, whose 5 lb box already covers them.

This is a screening check, not an engineer's review. The plans still say they are not engineered or code-checked.
