---
title: "Three numbers in Shed Designer's README had drifted from the tool"
date: 2026-10-30
tags: [shed-designer, engineering]
description: "A test now recomputes every figure in Shed Designer's README and worked example; its first run found a $548.77 saving that is now $283.91."
---

Shed Designer's marketing page already had a test that recomputes every number it quotes. The README did not. I added one: it builds the default design and the "8x12 classic" preset, runs the estimate, the structure check, the budget search and the hours count, and fails if any figure in the README differs from what the tool prints.

Its first run found three stale claims:

- **The budget search.** The README said the search saved $548.77 on the default shed, mostly by swapping a $615 shed door for a $246 prehung one. The default door has since become a site-built one, so that swap is gone. The search now finds $283.91 in materials and time, at $50 an hour: a 4" overhang, 2x4 floor joists at 24" on centre, an OSB subfloor, primed LP SmartSide 3/8" panels and 2x4 rafters. (The test proved its worth while this post was being written: other changes landed and moved the figure from $153.36 to $230.80 to $283.91, and each time the test failed until the README caught up.)
- **The default openings.** The README described a 38" x 78" door and two 24" x 36" windows. The tool now starts with a 38-1/2" x 78" site-built door and two 14x21 shed windows.
- **The ridge beam.** The README said 80% of capacity. The check gives 79%.

None of these was wrong when it was written. Each went stale when another change landed. The marketing page's test also covers seven more figures now: stud and plumb-cut lengths, the classic preset's door and windows, and the board waste behind its "why an 8 ft board" example. That example also gets a check that two 8 ft 2x4s still cost less than one 16 ft board at the starting prices.

All figures are screening estimates from listed prices, not engineering, and the tool has not been checked by building a shed from it. [Try Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/).
