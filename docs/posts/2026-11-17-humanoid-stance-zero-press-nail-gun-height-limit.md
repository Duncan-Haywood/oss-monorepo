---
title: "Can a humanoid nailing sheathing stand when the nail gun lifts off? Yes, up to a height limit"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, balance, nail-gun-recoil]
seo_title: "A humanoid's stance for nailing, and its height limit"
description: "Leaning 10-39 mm less lets every leaned humanoid stance stand at zero press and still take 50 N. A formula sets the height ceiling: 1.225 m for a G1."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing so that every nail lands on a stud. The last step found a problem with the stance. To push a nailer into the wall, the simulated humanoid leans into it. At 12 of 35 poses it leaned so far that it only balanced while pressing with at least 3.7 to 11.8 N. If the nailer's recoil lifts the nose off the wall, as published measurements suggest it can, the robot is left leaning on nothing.

The obvious fix is to lean less. This step tested it on the MuJoCo models of the Unitree G1 and H1, with five hypotheses registered before the run.

**Every stance can be fixed.** For each of the 12 poses, the lean was cut back to the furthest-forward one that still stands with no press at all. The robot's centre of mass moves back 10 to 39 mm. After that, every pose balances over the whole range from 0 to 50 N. The prediction that 20 mm would always be enough was wrong: the G1 at a 1.2 m hand height needs 39 mm.

**There is a hard ceiling, and it is a formula.** At the re-leaned poses, the range of press a stance can balance matches a rigid-body estimate exactly: (robot mass + tool mass) × g × sole length ÷ grip height. Between zero press and the top of that range, the centre of pressure crosses the whole sole, so no lean can do better. A stance that stands at zero press and still takes a 50 N press therefore exists only below a grip height of:

- **1.225 m for the G1** (33.3 kg, 0.17 m sole, with a 3.4 kg nailer);
- **1.883 m for the H1** (51.4 kg, 0.175 m sole).

The G1's highest poses grip at 1.185 m, 4 cm under that ceiling. Re-leaned, they tip back at 51.6 N, which leaves 1.6 N of margin over a 50 N press. Anyone choosing a robot for overhead nailing can run this check before buying one.

**The accuracy holds.** The programme's tool-point spec is a current wrist force-torque sensor, a small preload on the leg joints, a 10 N squeeze between the hands and a braked waist. Its whole setup was rebuilt on the new poses. With a 5 N pull from the air hose, the worst error at the nose is 0.011 mm on the G1 and 0.019 mm on the H1, about the same as before.

**What it costs.**

- One H1 pose (1.6 m, shifted 15 cm to the right) can no longer be held by the balance controller. It drops out of the set.
- The G1's worst pose loses 1.3 points of clean sheets with no hose (0.9160 down to 0.9030).
- The H1's worst-pose figure looks better, but only because its old worst pose is the one that dropped out.

The run does not separate how much of the G1's loss comes from the new lean and how much from the controller re-choosing which side of each joint's gear play to hold.

**Limits.** Statics only: the lift-off and the change of lean between nails are not simulated. The friction coefficient (0.5) and the balance controller are carried over from earlier milestones. Sole length comes from the Menagerie collision model, not a measured foot.

Code, results, log and paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
