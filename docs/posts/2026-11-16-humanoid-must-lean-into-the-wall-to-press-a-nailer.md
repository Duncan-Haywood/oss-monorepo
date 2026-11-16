---
title: "A humanoid pressing a nailer into a wall has to lean into it, and that undoes last milestone's flips"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid, balance, backlash]
seo_title: "Why a humanoid must lean into the wall to press a nailer"
description: "Through real soles, a Unitree G1 standing upright balances only 26–39 N of press above 0.8 m. Leaning fixes it, but backlash still needs per-pose care."
---

The `buildbot-sheathing` programme asks whether a robot can nail a sheet of wall sheathing to code tolerance. The last two milestones looked at gear backlash at the nailer's nose. A joint that the robot's weight and the 25–50 N press hold against one side of its gear gap gives a fixed bias, and calibration can remove a fixed bias. A joint that nothing holds rattles inside its gap. Milestone 31 found that three held G1 joints (both hip yaws and the waist roll) change sign across the wall. Because of that, one calibration left nails up to 3.4 mm off.

Both milestones made one modelling shortcut. Each foot could apply any force and moment at a single point, and the load was split between the feet by least squares. A real foot can only push down through its sole, with friction. So today's run gave each foot the contact points of the MuJoCo Menagerie model's own collision geometry: four small spheres under a G1 sole, and the ends of three capsules under an H1 sole. Each point gets a friction cone. Then a balance controller picks the forces.

**First finding: the upright poses can't take the press.** With real soles, a G1 standing upright balances at most 39 N of press at a 0.8 m hand height, 31 N at 1.0 m and 26 N at 1.2 m. The H1 reaches 25 N at 1.6 m. A 50 N push at chest height tips the robot back onto its heels, and the free foot moment of the old model had hidden that. The fix is what a person does: lean into the wall. Moving the centre of mass 4–12 cm forward brings the whole 25–50 N range inside what the soles can hold, at all 36 poses tested.

**Second finding: on the leaned poses, last milestone's flips are gone.** Neither hip yaw nor the waist roll changes sign under any of the five ground-reaction models we tried, the old least-squares one included. So milestone 31's flips came from the upright poses, not from how the load was split between the feet. One thing is structural, and the run checked it to zero: the waist and arm torques are identical under every model, because no foot is in their part of the body. A controller cannot change them, and the right wrist pitch, which does flip, is one of them.

**Third finding: a controller helps, but one calibration is still not enough.** Before the run we registered a guess that a controller could keep all 12 G1 leg joints pushed to one side of their gaps. It cannot: no force distribution does that at any pose, because the hips and knees carry tens of newton-metres whose sign the lean sets. Holding only the lightly loaded leg joints (hip rolls, hip yaws, ankle rolls) does work at every pose. This variant was added after the first run, so it is exploratory. Calibrated pose by pose, it cuts the worst backlash loss from 8.6 to 3.7 points of clean sheets. With one calibration the nails still drift up to 1.4 mm along the wall, or 1.1 mm from the best calibration pose. A single-2x joint has about ±3 mm of window, and other errors use most of it, so that drift is still too much.

So the engineering rule from milestone 31 stands: predict which side of its gap each held joint sits on from the static torques at every pose, and compensate there. The new part is that the poses this applies to have to be leaned ones. All of this is statics, and the friction coefficient is swept from 0.3 to 0.8 rather than measured. Balance dynamics and the nailer's recoil are not modelled.

Code, results and the figure are in [`research/buildbot-sheathing/experiments/m32_grf_qp/`](../../research/buildbot-sheathing/experiments/m32_grf_qp/). The log entry records the three hypotheses as registered, two refuted and one untestable.
