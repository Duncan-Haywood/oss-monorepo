---
title: "How stiff must a nailing robot's joints be? About 10,000 N m per radian, if the nose grips the sheet"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, joint-stiffness, mujoco]
seo_title: "How stiff must a humanoid's joints be to nail sheathing?"
description: "Joint windup under a nailer's 25-50 N press costs a G1 5.5 points of clean sheets at 10^4 N m/rad if the nose slides, and almost nothing if friction holds it."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails inside their windows on the studs. The last five steps moved the error budget from the robot's hand to the nailer's nose. They covered sensor quantisation, gear backlash, the poses along a wall, the balance controller, and finally a compensator that removes backlash completely if it models the robot's own controller.

One term was still listed as open in every one of those steps: **deflection under the press.** A contact-trip nailer fires when the nose is pushed against the work hard enough. Earlier steps took that as anywhere between 25 and 50 N. So between the nose touching the sheet and the shot, the load on every joint keeps changing, and every joint twists elastically a little more.

**Two springs in each joint.** One is the *servo*. Unitree publishes the PD gains it uses: 100 to 150 N m/rad at the G1's hips and knees, 40 at the ankles, 60 at the waist and arms. The servo only gives way to torque the controller does not feed forward. The other spring is the *transmission*, the gearbox and the structure behind the motor's encoder. It twists under all of the load, and if the encoder sits on the motor side the controller cannot see it. Nobody publishes a torsional stiffness for the G1's or H1's joints, so this step sweeps it from 1,000 to 300,000 N m/rad, the same on every joint.

**Free nose or stuck nose.** Earlier steps treated the nose as free to slide on the sheet. Under the press that is pessimistic, because friction pushes back. Along the wall normal the press is force-controlled, so the controller closes any windup there. In the wall plane a nose that sticks cannot move, and the windup survives only as a tilt of the tool about the nose. Working the statics through gives a tidy result: with the same stiffness on every joint, the reaction that keeps the nose stuck does not depend on the stiffness at all. Whether the nose sticks is a property of the pose and the press, not of the gearbox.

**The numbers** (MuJoCo Menagerie G1 and H1 on the 15 and 20 leaned poses from earlier steps, 12-bit joints, 5 arcmin backlash compensated with the matched model, best single-2x stack):

| Transmission stiffness (N m/rad) | Windup at the nose, free (worst G1 pose) | Clean sheets lost, nose free | Lost, friction-limited at μ 0.4 | Lost, nose stuck |
|---|---|---|---|---|
| 3,000 | 10.6 mm | 84.5 points | 19.1 | 0.01 |
| 10,000 | 3.2 mm | 5.5 | 1.05 | 0.00 |
| 30,000 | 1.1 mm | 0.5 | 0.11 | 0.00 |
| 100,000 | 0.3 mm | 0.04 | 0.01 | 0.00 |

Staying within 2 points at the worst pose takes about **18,000 N m/rad** on every joint if the nose can slide. At μ 0.4 it takes about **10,000**, for both robots. Stuck, the nail's tip at 44.4 mm deep moves only 0.02 mm.

**Does it stick?** Across the G1's poses the friction coefficient the nose needs runs from 0.07 to 0.79 (median 0.38). At μ 0.4 it sticks at 10 of 15 poses. The ones that slip are high and to the side of the stance. Nobody has measured a nailer nose on OSB, so μ is swept. A toothed or rubber no-mar tip is the cheap way to make sticking more likely.

**The servo is the soft spring.** A full magazine is 64 nails. Of 8d common nails that is 0.295 kg of steel, computed in the last step. Left out of the feedforward, it droops the G1's nose by **32 to 51 mm** under Unitree's gains, almost all of it downwards through the waist and ankle pitches. That is huge, but the joint encoders read this error. A robot that re-targets on its encoders, or simply counts the nails it has fired, removes it. One that trusts a fixed feedforward does not.

**Four hypotheses, registered before the run.** H124 said the G1's nose sticks at every pose at μ 0.4; it was refuted, sticking at 10 of 15. H125 said a free nose at 10,000 N m/rad loses more than 2 points; it held, at 5.47. H126 said a stuck nose at the same stiffness loses at most 1 point; it held, at 0.00. H127 said an unmodelled magazine droops the servo by more than 1 mm; it held, at 51 mm. The first run pinned the nose along the wall normal too. The pinning reaction then cancelled the press, which is physically wrong, so the model was corrected before any number was used. The log records the change.

**What it doesn't settle.** These are statics only, with no nailer recoil. Stiffness is the same on every joint, and the links and tool mount are rigid. The slipping case is approximated along the stuck reaction's direction. The torques are taken as linear from zero press. Nothing was tested on hardware.

The practical spec is three lines. Let the nose grip the sheet. Ask for joints stiffer than about 10,000 N m/rad behind the encoder (18,000 if the nose can slide). Close the loop on the joint encoders.

Code, results and figure: [`research/buildbot-sheathing`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/buildbot-sheathing), `experiments/m34_windup/`. Project page: https://marisstella.app/research/buildbot-sheathing/
