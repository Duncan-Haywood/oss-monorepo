---
title: "A waist brake takes a nailing humanoid's last half-millimetre of backlash error to 0.01 mm"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, backlash, digital-twin]
seo_title: "Does a humanoid's waist backlash limit nailing accuracy?"
description: "After a leg preload and a two-hand squeeze, the last 0.5 mm of a humanoid's nail-gun error is waist yaw backlash. A brake takes it to 0.01 mm."
---

The `buildbot-sheathing` programme asks whether a humanoid robot can nail a 4x8 sheet of wall sheathing to code tolerance. Two earlier milestones today dealt with gear backlash. The robot predicts which side of its backlash gap each joint sits on and corrects for it. A joint whose torque sits right at the holding threshold can land on the wrong side, and the correction then goes the wrong way. Holding the leg joints clear of the threshold through the foot forces fixed the legs. Squeezing the nailer between the two hands fixed the arms. What was left, up to 0.50 mm along the wall, came from the waist. The robot can't move those joints' torques: the tool's own load sets them.

So milestone 39 asks what the waist's hardware is worth. We kept everything from the squeeze milestone (the Unitree G1 and H1 models in MuJoCo, 34 poses leaned into the wall, a Robotiq FT 300 wrist sensor with 0.2 N of error, a 10 N squeeze, statics only) and changed only the waist's backlash gap:

- **stock:** 5 arcmin on every joint, as before;
- **yaw only:** waist roll and pitch rigid. Unitree's base G1 ships with a single waist joint, the yaw, and sells the roll and pitch as an option ([unitree.com/g1](https://www.unitree.com/g1/)). The MuJoCo model has all three;
- **precision:** 1 arcmin on the waist, the low end of catalogue precision gearboxes;
- **braked:** no gap on the waist, as a holding brake or lock would give.

**What the numbers say:**

- **A brake closes it.** At a 5 N hose drag the G1's worst error along the wall falls from 0.485 mm to 0.012 mm. The H1's falls from 0.501 to 0.019 mm. With the drag anywhere from 0 to 10 N, the G1's worst pose loses 0.04 points of clean sheets instead of 5.80.
- **A 1 arcmin gearbox gets most of the way.** It leaves 0.106 mm and 0.11 points. The error scales with the waist's gap, as the model says it should.
- **Dropping roll and pitch does nothing.** With them rigid the G1 still leaves 0.485 mm and 5.80 points. The waist joint that flips is the yaw, the one every G1 keeps.
- **A noisy sensor still sinks it.** With the FT 300's pre-2017 error (2.4 N), a braked waist still leaves 0.87 mm. That error flips arm and leg joints by more than any preload here can absorb.

We registered all five hypotheses before the run, and all five held. A check reproduced the squeeze milestone's numbers exactly before any waist case was changed.

**What a spec should say.** A humanoid nailing sheathing with a current wrist force-torque sensor needs three things. It holds its leg joints clear of the threshold through its foot forces. It squeezes the tool between its hands at 10 N or more. And it holds the waist yaw with a brake while nailing, or uses a waist gearbox with about 1 arcmin of backlash. Choosing the simpler one-waist-joint robot doesn't remove the problem.

**Caveats.** The brake is ideal: no gap and no compliance. The lock holds the waist at whatever angle the pose uses. The G1 pitches its waist up to 30° over our poses, while the base G1's roll and pitch are fixed at zero, so its poses would differ, and we did not re-solve them. Neither robot publishes a waist backlash figure, so 1 and 5 arcmin are swept values from the catalogue range. The 0.2 N m holding threshold comes from our own model, not a datasheet.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
