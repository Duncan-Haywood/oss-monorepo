---
title: "The cost of a nailing robot's safer stance is the stance, not its balance controller"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, backlash, digital-twin]
seo_title: "Is a humanoid's zero-press stance costly because of its controller?"
description: "A 2 x 2 of leans and controller sides: the G1's 1.3-point loss in clean sheets is all the lean. The flipped sides change nothing but keep one pose holdable."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. Earlier today, milestone 41 fixed a problem the nail gun's recoil exposed. At 12 poses the robot leaned so far into the wall that it could stand only while pressing the tool against it. Re-leaned 10 to 39 mm back, every one of those stances stands with no press and still takes the 50 N firing press. The price: the Unitree G1's worst pose lost 1.3 points of clean sheets, 91.60% to 90.30%.

Two things changed in that run, though. The poses moved, and the balance controller re-chose which way it holds six of the G1's leg joints against their gear backlash (it picks those "sides" over the whole set of poses). If the loss came from the sides, a designer could keep the old sides and get the points back for free. Milestone 42 checks that.

**The test.** A 2 x 2 on both robots (MuJoCo models of the Unitree G1 and H1, statics only): the old lean or the zero-press lean, crossed with the old sides or the new ones. Both robots were rebuilt by importing milestone 41's own code, so the poses and plans are the same objects. Four hypotheses were registered in the log before the run.

**What came out:**

- **Four sides flipped.** On the G1, both hip rolls and both ankle rolls swapped sides; the hip yaws didn't. The H1's sides didn't change.
- **The lean is all of it.** At the G1's worst pose the lean costs 1.30 points, the sides 0.00, and the interaction 0.00. At every pose where both choices of sides work, on both robots and both leans, the stack is the same to the last printed digit. A side says which way a joint is held, not whether it is held, and only loose joints spread the nails.
- **The flip still earns its keep.** With the old sides, one re-leaned G1 pose (hand at 1.2 m, 0.15 m to the side) has no controller solution at all. The new sides hold it. So the sides decide which poses the robot can work from, not how clean the sheets are where it can.
- **A correction.** Milestone 41 compared each pose's stack against a column from milestone 40 that took its joint torques from a different plan, one that includes a small leg preload and a two-hand squeeze. The two agree at each robot's worst pose, so milestone 41's headline stands, but they differ at 9 of 34 poses by up to 0.97 points. Compared like for like, the H1 loses 0.09 to 0.29 points per re-leaned pose, not the 0.1 to 0.9 we reported this morning. The G1 loses 0.31 to 1.30 at four poses and gains 0.60 to 0.79 at two.

Three hypotheses held. The fourth, that the old sides would still hold every re-leaned pose, was refuted.

**What it means for a spec.** A stance that stands without the press costs up to 1.3 points of clean sheets on the G1 near the top of its reach and under 0.3 on the H1, and no controller setting buys that back. Let the controller re-choose its sides when the stances change: it costs nothing and keeps one more pose usable. The next step costs the stance in the spec's own convention, with the leg preload and squeeze included.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
