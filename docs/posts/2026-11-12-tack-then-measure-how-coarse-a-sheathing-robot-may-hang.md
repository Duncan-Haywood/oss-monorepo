---
title: "Tack, then measure: how coarsely may a sheathing robot hang the sheet?"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, tolerance-analysis, humanoids, simulation]
seo_title: "How accurately must a robot hang wall sheathing before nailing?"
description: On doubled joint studs a robot that tacks the sheet and measures its edge may hang it to 0.54° and 10 mm; on single 2x joints it needs 0.03° and 0.4 mm, and re-hanging tops out at 87% clean.
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails where the code and the panel maker want them. Two earlier steps today and yesterday found the answer depends on the 34 joint nails, which must sit 3/8 in in from a sheet edge and still hit a 1.5 in stud. On a single 2x joint stud that leaves about ±3 mm. Bowed studs close it further.

This step asks the placement question a humanoid or a lift has to answer: **how far off may the sheet hang?** It also tests the obvious workarounds. A robot can drive two tack nails into the middle studs to freeze the sheet, measure where its edge actually landed, and aim the joint nails from that. If the window looks too tight, it can pull the tacks and hang the sheet again. We logged three hypotheses before running anything and then simulated 20,000 sheets in each setting, on the as-built studs of the last step (three reads a stud, 0.9 mm of tool scatter).

- **On single 2x joints, nothing rescues a coarse hang.** The sheet must hang to about **0.03° and 0.4 mm** (1σ) for 95% clean sheets, where 0.03° is 0.6 mm at the top nail. We predicted that re-hanging after a measurement would get a 1 mm / 0.1° hang to 95%. It doesn't: the best threshold reaches **87%**, at 2.1 hangs a sheet, and a stricter one does worse because the robot runs out of tries. With ordinarily bowed studs the best is 66%.
- **On doubled joint studs, the hang can be 18 times coarser.** Two 2x fastened together at each joint (which the shear-wall standard already calls for in some walls) let a robot that tacks and measures hang the sheet to **0.54° and 10 mm** and still get 95% clean sheets. A 3x allows 0.38° and 7 mm.
- **Holding the sheet while nailing is fine on wide joints.** If the robot holds the sheet instead of tacking it, the sheet moves a little under each nail after the edge was measured. On single 2x joints it may move 0.19 mm. On doubled joints it may move 4 mm.
- **Measuring the edge helps only when the hang is coarse.** With a near-perfect hang on single 2x joints, aiming at the design position slightly beats aiming from the measured edge, because the 0.5 mm edge reading adds noise of its own. On wide joints, measuring the edge nearly doubles the hang allowed.

This gives the next experiment its target. In earlier work, a co-held sheet tilted 2 to 6 degrees during the lift. Nobody has measured how a humanoid sets a sheet against a wall at the end of the lift. Getting it to 0.03° looks out of reach for any site robot. Getting it to half a degree and a centimetre is a reasonable thing to try with a ledger board or a lift. So the framing decides whether the robot question is even worth asking, again.

This is a model, not a measurement. The hang and sway errors are swept, not taken from a robot. Sway is modelled as an independent slip of the sheet under each nail. A re-hang is treated as a fresh attempt, which understates a robot that corrects from what it measured. Code, numbers, the figure and the pre-registered plan: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
