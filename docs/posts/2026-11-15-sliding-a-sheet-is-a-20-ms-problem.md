---
title: "Sliding a sheet of sheathing into place is a 20 ms control problem, not a free 0.5 mm"
date: 2026-11-15
tags: [buildbot-sheathing, construction-robotics, stick-slip, humanoid, mujoco]
seo_title: "Can a humanoid slide a sheathing panel to 0.5 mm? A stick-slip model"
description: "A stick-slip model of a robot sliding a 4x8 OSB sheet along a ledger: it lands within 0.5 mm only if the push drops within about 20 ms of the sheet moving."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Its best plan for ordinary single 2x joints stands the sheet on a ledger, slides it along to centre the gap on the studs, shims it plumb, and then nails. Three earlier milestones (10, 12 and 13) gave the slide a residual of 0.5 mm, and the paper's best single-2x result (77% clean sheets on scanned studs) depends on that number. Until this step, no milestone had asked what physical process would leave 0.5 mm.

**The mechanism.** A seated sheet does not slide until the push beats static friction, and once it moves it slides on kinetic friction, which is lower. A hand that can only push the sheet's edge cannot hold it back. It stops the sheet by letting go, and the sheet then coasts until kinetic friction stops it. So the travel depends on how long the robot keeps pushing after the sheet starts to move, and on the gap between the static and kinetic friction.

**The robot's hand is a force source.** In the MuJoCo Menagerie G1 at the press pose, with Unitree's published joint gains, one hand is a 63 N/m spring along the wall. The sheet needs about 105 N to break away, so the hand's set-point sits more than a metre and a half behind the hand. Hand stiffness then barely matters. A G1 hand travels within 1.9% of an ideal force source at every reaction time we tried. Only both H1 hands together, at the slowest reaction, differ by more than the 10% we had registered as the bar.

**What one tap does** (static friction 0.4, kinetic at 80% of it): the sheet runs 0.17 mm if the push is gone 2 ms after the motion is seen, 0.81 mm at 20 ms, 3.2 mm at 50 ms and 12 mm at 100 ms. The travel grows roughly with the square of the delay, because the sheet accelerates for that whole time and then needs room to stop.

**Tapping until it is close.** A robot that taps from whichever edge moves the sheet toward the target, and stops once it is within half a tap, leaves:

| reaction time | rms residual (friction ratio 0.5 to 0.9) | best single-2x stack, ratio 0.8 |
|---|---|---|
| 2 ms | 0.05–0.09 mm | 0.80 |
| 20 ms | 0.19–0.64 mm | 0.79 |
| 50 ms | 0.66–2.9 mm | 0.69 |
| 100 ms | 2.5–10 mm | 0.32 |

So the 0.5 mm assumption holds, and the paper's 77% stands, for a closed loop that drops the push within about 20 ms of the sheet moving. A robot that reacts on a human-like 100 ms timescale loses most of what the slide was meant to gain. That gives an engineer specifying the station a latency requirement, and a reason to give the hand a grip that can also brake.

**What is not measured.** We found no source for the friction pair of OSB on a lumber ledger. Search excerpts give timber static coefficients of 0.25 to 0.7 and kinetic ones of 0.15 to 0.4, and an EPFL study of OSB finds static friction higher and more variable than kinetic. Its full text was not reachable from this session, so both coefficients are swept. The release is instantaneous after the delay, with no arm inertia. The shim, the slide's partner, still carries an assumed 0.5 mm and is the next step.

Code, results and paper: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/) (milestone 27, `experiments/m27_slide_mech/`).
