---
title: "A wall-sheathing robot should stack shims, not drive a wedge"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, simulation]
description: "Plumbing a 4x8 sheet needs about 1 mm of lift. A 1/16 in shim stack leaves 0.46 mm; driving a tapered shim takes 119 N, which a stock G1 can't push."
---

The `buildbot-sheathing` programme asks whether a robot can hang and nail a sheet of wall sheathing to code tolerance. Its best single-2x pipeline assumes two small fixes before the sheet is tacked. The robot slides the sheet along its ledger to centre the joint gap, then lifts the low bottom corner until the edge is plumb. Both fixes were credited with 0.5 mm of error left over. Yesterday's step modelled the slide as stick-slip friction. It found the 0.5 mm holds only if the robot lets go within about 20 ms of the sheet moving. Today's step models the shim.

**How much lift?** The sheet turns about its high corner, so the lift is the tilt times its 48 in width. The ledger's laser error and the panel's squareness (from the earlier simulations) give a median of 0.95 mm and a 99th percentile of 3.0 mm.

**Option 1: stack shims.** Plastic horseshoe shims come in 1/16, 1/8 and 1/4 in (supplier listings). Rounding the lift to whole 1/16 in steps leaves **0.458 mm rms**, which is almost exactly the 0.5 mm the earlier steps assumed. Back in the best pipeline, on measured studs and with the 20 ms slide, the stack gives **0.796** clean sheets against 0.791 with the assumption. 1/8 in steps cost 2.6 points; 1/32 in shim stock gains 1.3.

**Option 2: drive a wedge.** A composite taper shim (8 in long, 1/16 to 5/16 in, so 1:32) could set the height continuously. But it carries half the sheet's weight plus the wall friction that resists the turn. With every face at a friction of 0.4, it takes a **118.5 N** push. In MuJoCo, with Menagerie's models and the same whole-body check as before, a stock Unitree G1 pushes **65.6 N** into the wall at the model's 0.5 m ledger height, limited by its waist pitch joint. That is enough only if the faces are slicker than 0.25. An H1 manages 132 N.

There is a second surprise. Along the push, the robot's hand has an effective mass of under 1 kg, against the 21.8 kg of the sheet in yesterday's slide. So once the wedge breaks away, it runs far: 12.7 mm per tap at a 20 ms release, and 337 mm at 100 ms, which is longer than the wedge itself. The 1:32 taper still leaves **0.13 mm**, not the under-0.1 mm we predicted before the run. Two of the three registered hypotheses were refuted.

**What a builder of such a robot can take from it.** The shim worth building is a dispenser that places a counted stack of 1/16 in shims. That is a pick-and-place job, with no force or timing requirement, and it is as good as the paper assumed. A wedge buys about a point more, and only for a robot that can push about 120 N near the bottom of the wall and release within 10 to 20 ms.

Limits: the shims' face frictions are swept, not measured. The stack sits at exactly its rounded height. The ledger height is the model's own. Nothing here was tested on hardware.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing) ([live page](https://marisstella.app/research/buildbot-sheathing/)).
