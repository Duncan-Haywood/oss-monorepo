---
title: "A nailing robot's accuracy has to be measured at the nail, not at the hand"
seo_title: "A nailing robot needs accuracy at the nail, not at the hand"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, simulation]
description: "Carried to a nailer 0.3 m ahead of the grip and 44 mm into the stud, a stock G1's 0.9 mm becomes 1.3 mm, and clean sheets fall from 0.80 to 0.26."
---

The `buildbot-sheathing` programme asks whether a robot can hang and nail a 4x8 sheet of wall sheathing so that all 62 nails land where the code and the panel maker want them. For 28 steps, every clean-sheet figure took the tool's error as 0.9 mm. That number came from an earlier project. It is a stock Unitree G1's 11-bit joint sensors, rounding error only, carried through the robot's kinematics to the **hand**.

A nail is not driven from the hand. Two things were missing.

**The nailer's length.** The nose of a framing nailer sits ahead of the grip; we use 0.3 m, the figure the earlier project used (no maker's figure found). The same joint errors that move the hand also turn it, by about 0.1° (1σ) in MuJoCo with Menagerie's G1. Over 0.3 m that rotation moves the nose a further few tenths of a millimetre.

**The nail's depth.** A nail doesn't count as "in the stud" because its head is over the stud. It has to stay inside the wood for ten shank diameters past the sheathing, the rule the programme's second step used. That point is 44.4 mm below the surface, so a nail that leans moves again by the time it gets there. The panel-edge rule is still checked at the surface. The stud rule is now checked at depth, with the two offsets correlated, because the same joint errors cause both.

**What it does.** Along the wall, the G1's scatter goes from 0.93 mm at the hand to **1.31 mm at the nose and 1.38 mm at depth**. The programme's best single-2x pipeline (measured studs, a read at every nail height, the stud pushed straight, the sheet slid and shimmed) falls from **0.796 clean sheets to 0.264**. A stock H1 gives 0.571. That looks dramatic, but the old model is just as steep: with 0.9 mm replaced by 0.6 mm it gives 0.96, and by 1.3 mm it gives 0.32. Every placement remedy the programme has costed sits on a cliff edge of tool scatter.

**The fix is cheap on paper.** The same G1 with **12-bit** joint sensors and the same nailer gives **0.934**, and 13 bits gives 0.991. So the spec a builder should write is accuracy at the tool point, along the wall, at the stud's depth: about 0.9 mm, not "0.9 mm at the hand". An extra lean of the nail, from the tool's own aim or the nail deflecting in the wood, is tolerated up to 0.43° (1σ) before it costs another 2 points.

**Doubled joint studs don't care.** With a 3 in nailing face at each sheet joint, the pipeline stays at 1.000 at every nailer length and at a 2° lean. It drops only when the joint error is four times the 11-bit rounding (0.395 at 0.3 m).

All three hypotheses we registered before the run held. The numbers are best cases. Only sensor rounding is carried to the nose; gear backlash, the arm and tool mount bending under the push, and calibration error would all add to it. The nose length is not a maker's figure. Nothing here was tested on hardware.

Code, results and the paper draft: `research/buildbot-sheathing` (milestone 29).
