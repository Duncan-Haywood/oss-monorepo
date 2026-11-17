---
title: "A ledger board squares the sheet, if the robot lets go"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, mujoco, tolerance-analysis, humanoid]
seo_title: "Can a ledger board help a robot hang wall sheathing plumb?"
description: "In MuJoCo, a sheet set on a ledger and released seats to 0.0001° if the robot presses under ~100 N; then the panel's PS 2 squareness is the limit."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and get all 62 nails where they belong. The step before this one set a target for placement. With doubled joint studs, a robot that tacks the sheet and measures its edge may hang it to about **0.5° and 10 mm**. With single 2x joints it needs **0.03°**, which no site robot holding a sheet looks able to do. Framers don't hang sheets free, though. They often rest the bottom edge on a ledger, a temporary board levelled to a line. This step tests that guide in a physics simulator. We wrote five hypotheses down before running anything.

The setup in MuJoCo: a 21.8 kg sheet is pressed against a wall and lowered 0.25 to 2 degrees off plumb onto a level ledger. One bottom corner lands first. Then the holder lets go of its vertical support, either releasing or keeping its grip on the sheet's rotation.

- **If the robot lets go and presses lightly, the ledger does the squaring.** Gravity turns the sheet about the corner that landed first until both corners sit on the ledger. Across every friction value tried (0.2 to 0.7) and every press up to 100 N, the sheet ended within **0.0001°** of the ledger.
- **Press too hard and friction freezes the mistake.** Above a threshold the sheet keeps its whole error. A one-line moment balance predicts the threshold: friction times press times the mean lever arm to the wall contacts, against the sheet's weight times half its width (130 N·m). In simulation the threshold ran from 115 N to 380 N depending on friction, 87 to 99% of the prediction.
- **A stiff wrist keeps part of its own error.** A robot that keeps holding the angle it thinks is plumb fights the ledger. Above about 7,500 N·m/rad of wrist stiffness (for a 1° error) some of the error stays. The closed form matched 29 of the 30 simulated cases. We had predicted all 30, so that hypothesis is marked refuted.
- **Once the sheet is seated, the panel is the limit.** The panel standard (PS 2-18) allows a panel to be out of square by 0.083° and its edges to bow 1/16 in. A bottom edge bowed outward rocks the sheet onto its middle and one corner, up to 0.149°. A good laser line adds 0.02°. On **doubled joints** that is nothing: **100% clean sheets** in every setting. On **single 2x joints** it is too much. With panels spread uniformly up to the PS 2 limits we got **84 to 86%** clean, and 95% needs panels within about a quarter of those limits.

What this says about humanoids: a robot doesn't need to hang a sheet plumb. It needs to set the sheet on a ledger, go limp in roll and press gently. Whether a G1 or H1 can do that while carrying 22 kg is the next part of this milestone. It also adds to the case for doubled joint studs. On single 2x joints the floor now comes from the lumber yard, not the robot.

What it is not: the sheet is rigid and touches the wall at a few points. The holder is a simple impedance law, not a humanoid's arm. Wall friction, press force and how carefully the ledger is fixed were swept because we found no measured values. PS 2 gives limits, not distributions, and real panels are probably well inside them, which is the number that would settle the single-2x case. Code, results, the figure and the pre-registered plan: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
