---
title: "One calibration is not enough: a humanoid nailer's backlash bias moves 3.4 mm across the wall"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, backlash, calibration, mujoco]
seo_title: "Can one calibration remove a humanoid's gear backlash?"
description: "Held joints' backlash is a fixed bias only at one pose. Across a G1's reach three joints flip their load, leaving nails up to 3.4 mm off after one calibration."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails inside their windows on the studs. The [last step](2026-11-16-humanoid-nailer-gear-backlash-ankle-roll.md) found that gear backlash only adds random error on joints that nothing loads one way. A joint that gravity, the 3.4 kg nailer and the press into the wall hold against one side of its gear play sits there at every nail. That is a fixed offset, and the step assumed a tool-point calibration removes it.

That assumption was checked at one pose: hand 0.4 m in front of the feet, 1.0 m up the wall. A robot nailing a stud works from near the floor to the top of its reach, and a little to either side of where it stands. This step repeats the analysis over every pose a stock Unitree G1 reaches from one stance, and asks two questions. Does the set of held joints stay the same? And does one calibration still do?

**The grid.** For the G1 there are 15 poses: hand heights 0.4 to 1.2 m in 0.2 m steps, with the hands shifted 0, +0.15 and −0.15 m along the wall. At ±0.3 m, or above 1.2 m, the inverse kinematics misses its target, so those poses are out of reach. For the H1 there are 21 poses, up to 1.6 m. At each pose the step computes static joint torques in MuJoCo, using the Menagerie models with feet planted. The loads are gravity, the nailer and a 25 to 50 N press at a nose 0.3 m ahead of the grip. The scoring is the programme's best single-2x pipeline with 12-bit joint sensors and 5 arcmin of backlash per joint.

**Calibrated at every pose, the top of the reach is the weak spot.** Between 13 and 20 of the G1's 22 nose-moving joints stay held. The two ankle rolls are loose at every pose. At 1.2 m the knees, a shoulder joint and the wrist joints join them. The loss against each pose's own no-backlash score runs from 0.3 to 9.9 points. The worst pose is 1.2 m: 91.3% clean sheets fall to 81.4%. That refutes H115, which allowed 3 points. The H1 loses at most 1.4 points.

**Calibrated once, it falls apart away from the calibration pose.** Six G1 joints are held at every pose. Three of them change the sign of their torque across the grid: both hip yaws and the waist roll, which runs from −27.8 to +20.0 N m. A joint whose load flips rests on the other side of its gear gap. Calibrate the tool frame once at 1.0 m, and the leftover offset of every nail along the wall reaches 3.4 mm at the 0.4 m pose shifted 0.15 m. There the pipeline gets 0% clean sheets.

The calibration pose itself loses nothing. Straight in front of the robot, the leftover is 0.1 to 0.4 mm from 0.4 to 0.8 m, and 0.9 mm at 1.2 m. The shifted poses carry the flips: 3.8 mm of the worst 3.4 mm comes from them, partly offset by the Jacobian changing. H116 (some held joint flips) and H117 (one calibration leaves more than 0.3 mm) both held.

**The spec this sets** (largest backlash that keeps every pose within 2 points of its own no-backlash score):

| Joint sensors | Calibrated at every pose | Calibrated once |
|---|---|---|
| 12 bits | 2.49 arcmin | 0.44 arcmin |
| 13 bits | 4.13 arcmin | 0.79 arcmin |

Catalogue precision planetaries are rated 1 to 7 arcmin. With one calibration, none of them is good enough. With a calibration per pose, a good single-stage unit is.

**What a builder would do with it.** The static torques that decide which joints are held also say which side of its gap each one rests on. So the bias can be predicted at every pose and subtracted, or calibrated per stance and height band. A single tool offset can't do it. The holding threshold, swept from 0.05 to 0.5 N m, changes none of this: the worst losses run 9.9 to 10.0 points and the worst offsets 3.4 to 3.7 mm.

**What it doesn't settle.** The torques that flip (hip yaw, waist roll) depend on how the feet share the ground reaction. Here that split is the least-norm one, not a balance controller's. A controller with friction cones could move the flips or remove them, and that is the next step. Each held joint is placed at exactly half its gap, with no friction or compliance inside the gap. The backlash itself is swept, because Unitree publishes no figure. Nothing here was tested on hardware.

Code, results and figure: [`research/buildbot-sheathing`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing), `experiments/m31_pose_range/`. Project page: https://marisstella.app/research/buildbot-sheathing/
