---
title: "A nail gun's recoil lifts the nose off the wall. Does that undo a humanoid's millimetre spec?"
date: 2026-11-17
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, nail-gun-recoil, backlash]
seo_title: "Nail gun recoil and a humanoid robot's nailing accuracy"
description: "A framing nailer's recoil, bracketed from published data at 0.09-8.7 N s, lifts the nose. The re-press keeps the 0.012 mm spec; the stance is the risk."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing so that every nail lands on a stud. Over the last few milestones it built a spec for the tool point of a humanoid holding a framing nailer: a current wrist force-torque sensor, a small preload on the leg joints, a 10 N squeeze between the hands, and a brake on the waist. In the model, those four take the worst error at the nose from about 1 mm down to 0.012 mm.

Every one of those milestones left one question open: the nailer's recoil. This step looked at it.

**No one publishes a framing nailer's recoil, so we bracketed it.** Two measurements set the ends:

- **A floor.** A study of nail-gun head injuries timed pneumatic nails leaving the tool at 29.8 to 36.9 m/s with a ballistic chronograph (Buchalter et al. 2002, as quoted by NIOSH). An 8d common nail's shank weighs 4.33 g, so the nail alone carries 0.13 to 0.16 N s. The piston and driver add to that.
- **A ceiling.** A NIOSH force-plate study of framers nailing flat found that the recoil took about 24% of the tool's weight off the user between shots (Lowe, Albers and Hudock 2014). Taken at face value, that is about 8.7 N s a nail, for the user and the tool together.

An earlier simulation, [`buildbot-recoil`](https://marisstella.app/research/buildbot-recoil/), found that a G1 arm loses the wall somewhere between 0.25 and 1 N s. That band sits inside the bracket, so the nose may well leave the wall. A sequential-trip tool has to release its contact arm between shots in any case. Either way, each nail starts with the press rising again from zero.

**Why that could matter.** The error model treats a joint whose torque stays under the gearbox's holding threshold as "loose": it can sit anywhere in its backlash gap, at random. A press that rises from zero might push some of those joints to one side and leave them there. That would turn random scatter into a repeatable offset, which the old compensator does not know about. Five hypotheses were registered before the run. Four were refuted.

**What the run found.**

- **The re-press sets none of them.** At the 56 loose joints that move the nose, the rising press never reaches the threshold. The closest comes to 0.16 N m, against 0.2 N m.
- **Why random was right.** 36 of the 56 change sign inside the 25 to 50 N press window. Where they sit depends on the force at which the tool fires, not on how the nose got back to the wall.
- **The spec holds.** With a 5 N pull from the air hose, the worst error stays at 0.012 mm whether or not the compensator models the re-press. Only a heavy 20 N hose drag lets the rise set one wrist joint, and then a compensator that ignores it is off by 0.2 mm.
- **The stance is what breaks.** The run first failed at a third of the poses, for a reason that turned out to be the main finding. At 12 of 35 poses the robot leans into the wall and only balances while it presses with at least 3.7 to 11.8 N. That includes the G1 at hand heights of 1.0 to 1.2 m and the pose the programme calibrates at. If the recoil lifts the nose there, the robot is left leaning on nothing.

**What that means for a spec.** A robot that fires a nailer able to lift off needs a stance that balances with no press at all, or a controller that catches the lean. That joins the sensor, the leg preload, the squeeze and the waist brake on the list.

**Limits.** The re-press is modelled quasi-statically: no recoil transient is simulated, and the recoil only decides whether the nose lifts. The holding threshold is not taken from any source; below about 0.16 N m the re-press would start setting joints. Balance below a pose's window is only reported as failing, not modelled. Everything is statics on the MuJoCo Menagerie models of the Unitree G1 and H1.

Code, results, log and paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
