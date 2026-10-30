---
title: "A saltbox roof, framed and checked: the look costs about $27 to $82"
date: 2026-10-30
tags: [shed-designer, framing, structure, cost]
description: "The shed designer's engine now frames a saltbox: an off-centre ridge, two pitches, two rafter cuts and unequal wall loads. At 8x12 it costs $27 to $82 more than a gable of the same finishes, for about the same storage."
---

A saltbox is a gable with its ridge pushed toward one side. There is a short, steep slope over the front and a long, shallow one at the back. It is the old New England farmhouse shape, and on a shed it reads as more deliberate than a plain gable. The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/)'s framing engine now builds one board by board. The plan sheets, 3D view and editor come next, so the saltbox is not in the New design menu yet.

**How the shape is set.** You choose two whole pitches: the back's (`pitch`) and the front's (`frontPitch`). The ridge then sits where the two rafters' top lines meet over it. Near enough, front run × front pitch = back run × back pitch, so a 10/12 front over a 5/12 back puts the ridge a third of the way back. The tool solves it exactly, allowing for the rafter depth and the seat. On the 8x12 starter that is 31-1/16" from the front wall's outside face. Both eave walls stay the same height. The front is the steep side, and it is held to at most three times the back's pitch. That keeps the ridge at least a quarter of the width from the front wall.

**What changes in the framing.**

- There are two rafter cuts: 55-3/4" for the front and 81-5/8" for the back, each with its own plumb cuts and birdsmouth.
- The ridge board (or two-ply ridge beam) sits off centre. Its top is flush with the steep front rafters. The shallow back rafters stand 5/16" proud of it at their plumb cut, and the sheathing bridges the gap. The ridge is sized to take the deeper of the two plumb cuts: a 2x8 here.
- The gable ends peak over the ridge, not mid-width. The siding panels, lap courses, rake boards and gable studs all follow the two-slope roof line, and the gable vents centre on the ridge.
- A ridge beam's posts come down off centre, so the nearest inner skid moves under them. If none is within half a skid spacing, the tool adds one.
- Each tie end is cut to its own slope where the rafter top comes down below the tie.

**The structure, and one tidy result.** A rafter pair with a tie is a three-hinged frame. Put an even load w (per foot on plan) over a front run a and a back run b, and take moments about the ridge for each half. The two wall reactions come out equal, w(a + b)/2 each, wherever the ridge is. The tie force is H = w·a·b / (2h). For a gable (a = b) that is the familiar wL²/8h. Moving the ridge off centre shrinks a·b, so the 8x12 saltbox's ties pull 307 lb a pair, less than the 5/12 gable of the same width. The tests check the three equilibrium equations directly.

Under a ridge beam each rafter is a simple span, so the beam takes half of each side's rafters. The long back hands it 125 lb/ft and the steep front 64 lb/ft. The back wall carries about 60% more snow than the front here. The dead load differs a little too: 15 psf along each slope is 19.5 psf on plan at 10/12 and 16.3 at 5/12. So the checks now run per side:

- two rafter rows: the front at 8% and the back at 35%, both 2x6 at 24";
- the heel-joint nails at 74%;
- the headers on each wall with that wall's own load;
- uplift on the worse side;
- the ridge beam at 85%. It is checked with the steep front's dead load over its whole strip, which errs on the safe side, and the detail says so.

The steep front rafters are very lightly used. A shed that wanted to save a few dollars could cut them from 2x4s. The tool still uses one rafter size for both sides.

**Cost and space, at the dated store prices, before tax.** I took the 8x12 starter (lap siding over OSB, shingles, a site-built door, two small windows, 84-1/2" walls) and changed only the roof shape.

| Roof | Total | Peak | Volume |
| --- | ---: | ---: | ---: |
| Saltbox 10/12 front, 5/12 back, ridge board | $3,280.28 | 10.97 ft | 677 cu ft |
| Saltbox 8/12 front, 4/12 back | $3,256.74 | 10.51 ft | 661 cu ft |
| Gable 5/12, same everything else | $3,198.05 | 10.40 ft | 662 cu ft |
| Gable 6/12 | $3,253.55 | 10.74 ft | 675 cu ft |

So the saltbox is a looks choice, not a storage one. Next to a gable with the same peak and space (the 6/12), it costs $26.73 more. Next to the 5/12 gable it costs $82.23 more, for 15 cu ft. Nothing in it is longer than the 12 ft plates, so it still hauls in a car-roof load.

**What is not done.** The saltbox is not yet drawn on the plan sheets, in the 3D view or in the end-view editor. Those still assume a centred ridge, which is why the preset is held out of the menu until they are done. The build steps and the design search come after that. As always, this is a screening tool. Nothing here is engineered or code-checked.
