---
title: "A nail gun's air hose costs a sheathing robot more than its nail magazine does"
date: 2026-11-16
tags: [buildbot-sheathing, construction-robotics, humanoid-robots, digital-twin, automation-in-construction]
seo_title: "Does a nail gun's air hose throw a robot's nails off the stud?"
description: "We modelled a nail gun's air hose as a catenary dragging on the floor. A 5 N pull moves a humanoid's nail 1 mm; 0-10 N of drag costs 21 points."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Milestone 33 found that the robot can cancel gear backlash if it predicts each joint's load with its own balance controller. A full nail magazine left out of that model then cost only 0.017 mm. Milestone 35 asks the same question about the air hose.

**A hose is not a mass.** A 3/8 in × 50 ft hose weighs 5.1 lb (hybrid polymer) to 9.21 lb (rubber), going by the retailer listings. It hangs from the tool to the floor in a catenary. Once the robot has walked along the wall, the length lying on the floor drags behind it. At the grip that means two pulls. The hanging length pulls down with 0.6 to 4.3 N. The floor holds a horizontal tension of 1 to 22 N, depending on friction and how much hose is dragging (both swept). The direction of that tension depends on where the hose runs. The robot's controller doesn't know either pull.

**What the numbers say** (Unitree G1 and H1 models in MuJoCo, 35 poses leaned into the wall, statics only):

- At a joint stiffness of 10⁴ N m/rad, a **5 N** pull moves the G1's nose **1.25 mm** in the wall plane. The encoders don't see this. The worst direction is towards the wall, not along it: a pull along the wall's normal acts like a change in press force, which milestone 34 found to be the most costly load.
- The backlash compensator that coped with the magazine is left **1.0 mm** off along the wall by a 5 N pull. Even a hose that only hangs leaves 0.47 mm, because the length of hose hanging changes with the grip's height.
- When the hose tension is unknown, anywhere in 0 to 5 N, the worst G1 pose loses **2.2 points** of clean sheets. Over 0 to 10 N it loses **21 points**.
- Unitree's PD servos give way far more: 175 to 205 mm at 5 N. The joint encoders do see that error, though, so re-targeting on them removes it.

**What a spec should say.** Take the hose off the tool, with a boom or balancer feeding it from above. Or measure the tool's wrench at the wrist (not yet modelled here). Or keep the drag to a few newtons. Two of our four registered hypotheses were refuted: the one saying a hanging hose is harmless and the one saying a pull along the wall is the worst case. Hose weights come from listings. Floor friction, dragged length and joint stiffness are swept, and nothing was tested on hardware.

Code, results and the paper draft: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
