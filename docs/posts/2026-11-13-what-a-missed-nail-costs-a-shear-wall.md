---
title: "What a missed nail costs a shear wall, when a robot misses in runs"
date: 2026-11-13
tags: [buildbot-sheathing, construction-robotics, shear-wall, structural, simulation]
seo_title: "How much shear capacity does a missed sheathing nail cost?"
description: "A sheathing nail that misses its stud costs about 2% of a sheet's racking capacity. A robot's misses cluster; 4 in joint nailing covers them."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. The last step found that the case for a doubled joint stud comes down to one number: what a missed nail costs beyond driving it again. Until now every model assumed each miss is found. This step asks what happens when one is not. A nail that misses its stud (a "shiner") is a fastener missing from a shear wall.

We used a textbook plastic model of a fully anchored sheathed wall (Källsner and Girhammar, *Engineering Structures*, 2009). The framing is pinned at its joints, the sheet is rigid and every nail yields at the same force. Capacity is the least work over the ways the sheet can move. Because only ratios matter, the model needs where the nails are and nothing else. We fed it the miss patterns of the programme's simulated robot on six real studs taken from a public laser scan.

- **It tracks the code table.** At 4, 3 and 2 in edge spacing the model gives 1.44, 1.88 and 2.77 times the capacity of 6 in spacing. The shear-wall table's ratios for 15/32 in Structural I panels are 1.54, 1.96 and 2.61. Every one is within 6%.
- **One miss costs about 2%.** A nail on a sheet's joint edge carries 2.0–2.2% of the sheet's capacity, a plate nail 1.1–1.8% and a field nail 0.7–1.0%.
- **Misses come in runs.** With three stud reads, the robot misses 1.1 nails a sheet. Left in, the average sheet keeps 97.7% of its capacity, but the worst 1% keep only 88.5%. When the robot misjudges a stud it misjudges it at a run of heights, so 13% of sheets miss three or more nails.
- **More nails cover them.** Nailing the two joint edges at 4 in instead of 6 in keeps 99.98% of sheets at or above an intact 6 in sheet, with every miss left in. In the programme's cost model the 16 extra nails cost less than re-driving the misses: a median $6.98 a sheet against $7.10, and $12.17 for the doubled stud.

Before the run we wrote five predictions in the log. Three held. Two were refuted, and one of those matters most. A Washington State thesis (Weiss, 2017) tested walls with the bottom foot of nails left out and found they lost about half their capacity. Our model loses only 20% in the same case. So it is optimistic about clustered missing nails, and every loss above is a lower bound. Scaled up by that 2.45 factor, 97.6% of 4 in sheets still clear the bar. The other refuted prediction was that the worst 1% of three-read sheets would lose under 10%; they lose 11.5%.

What this does not settle: whether a building official would accept a nailing schedule that expects shiners. It is a design margin for a robot, not a reason to skip inspection. The next useful measurement is a racking test of sheets with shiners at the positions the robot misses. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
