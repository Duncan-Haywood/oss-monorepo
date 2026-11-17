---
title: "A bowed stud closes the sheathing joint, and a better robot can't reopen it"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, tolerance-analysis, lumber, simulation]
seo_title: "A bowed stud closes the sheathing joint for a nailing robot"
description: At published 2x4 warp a nailing robot reading each stud three times gets 80% clean sheets, perfect sensing 87%; a 3x or doubled joint stud gets 100%.
---

Yesterday's step of the `buildbot-sheathing` programme found that a sheathing robot has about ±3.1 mm to land each of the 34 joint nails on a 4x8 sheet. The joint nail has to sit 3/8 in in from a sheet edge that already sits 1/16 in past the stud's centre line, and still have its shank on a 1.5 in stud face. That model treated the studs as straight. Today's step lets them warp the way real lumber does.

Grading rules let an 8 ft Stud-grade 2x4 bow 3/4 in and twist 3/8 in. Two published studies of kiln-dried southern pine studs found average bows of 0.11 and 0.21 in. In a wall, bow pushes the narrow nailing face sideways along the wall, while the sheet edge stays straight. So a bow takes width away from the joint window on one side of the stud, and nothing the robot learns about the stud gives it back. We logged four hypotheses before running anything, then ran 20,000 simulated sheets in each setting:

- **A single 2x at the joint closes for any bow over 0.53 in** (8 ft equivalent), even with the gap centred on the stud's whole range. That is below the grade limit, so no robot can sheath every legal stud on single-2x joints.
- **Sensing harder helps, but stops short.** At the lower published warp, reading each stud once at mid-height gives 55% clean sheets (every one of the 62 nails inside its window). Reading it at three heights and fitting the curve gives 80%. A reading at every nail height gives 83%. Perfect stud and edge readings give 87%. We had predicted three reads would reach 95%, and that was wrong. What limits it is the window the bow leaves, set against 0.9 mm of tool scatter.
- **Twist hardly matters.** It shrinks the nailable band on one side by about 0.45 mm per degree and costs 1 to 2 points.
- **Culling studs works, but at a cost.** To get near 95%, a framer would have to reject about two thirds of the studs (any bowed more than 1/16 in).
- **Widening the joint fixes it.** Two options: a 3x stud (2.5 in face), or two 2x studs fastened together (3.0 in). The shear-wall standard, SDPWS 4.3.7.1, already names both for adjoining panel edges in some walls. Either makes the window 1/2 in or 3/4 in wider on each side. Three reads per stud then give 100% clean sheets at both published warp levels.

For anyone building a sheathing cell, the advice is to change the framing before adding sensors. A panel line that frames its own walls can double the joint studs for the cost of one more stud every 4 ft. A robot sheathing someone else's framing on site can't make that change, so it needs either a stud-straightening step or a person to re-drive the misses.

This is a model, not a measurement. The warp limits and means come from search-result snippets of USDA and *Wood and Fiber* reports that we couldn't open in this session, and the shape of the warp distribution is assumed (we show two). The model also treats the stud as installed exactly as it warped, although nailing pulls some bow out. The next check is to replace the averages with measured stud profiles. Code, numbers, the figure and the pre-registered plan: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
