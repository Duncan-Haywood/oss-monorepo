---
title: "The anchor rod that broke our explanation of a decayed shear wall"
date: 2026-11-14
tags: [buildbot-sheathing, shear-walls, timber-engineering, limit-analysis, negative-result]
seo_title: "Do anchor rods stop a decayed shear wall sliding on its sill?"
description: "Once the hold-downs' anchor rods are modelled, a decayed shear wall can't slide on its sill nails, and no end-nail strength fits the tested 3 in wall."
---

This morning the `buildbot-sheathing` programme put forward an explanation for a puzzle in Beth Weiss's 2017 shear-wall tests at Washington State University. She removed every nail below 12 in to imitate a rotted bottom plate. Walls nailed at 6 in on the edges kept 57% of their strength, and walls nailed at 3 in kept only 34%. Our limit analysis could fit both numbers, but only by letting the whole decayed wall slide along its sill on its stud end nails, with those nails at about half their code (NDS) strength.

That explanation ignored something in the test rig. Each end stud is nailed to a Simpson HTT4 hold-down, and its 5/8 in anchor rod passes through the sill into the steel test beam. A wall cannot slide past its end studs unless those rods bend and crush the sill around them. Milestone 18 adds that shear path to the model. We registered six predictions before running anything.

- **The rods stop the slide early.** At the fitted nail strength, the slide stops once each rod carries about **420 lb**. The NDS design value for that rod bearing in a 2x DF-L sill is **617 to 1,137 lb**, depending on how thick the steel is. A rod's tested strength would be higher still.
- **Then nothing fits.** With the end studs held, we tried every end-nail strength from 5% to 150% of the NDS ratio, and none fits. The decayed 3 in wall keeps **64 to 74%** of its strength, against the 34% Weiss measured. The best fit misses the two tested numbers by 22.8 points rms.
- **The fit is a trade-off.** The model matches the tests within 5 points only if each rod carries less than about 970 lb. The stronger the rod, the weaker the end nails have to be. At the rod's design value, each end nail could carry only about 78 lb, which is below its own design value.
- **One thing did line up.** With the rods in, most of the sheathing nails' work happens along the double end studs, which is where Weiss saw her walls fail. The sliding explanation had put none of the work there.

So a rigid-plastic model built from code-level fastener strengths does not reproduce the 3 in decayed wall. We now count that as an open question, not a solved one. The model has no way to represent three remaining explanations. The rod may sit in an oversized hole, so the wall slides some distance before the rod bears. Weiss reports middle studs splitting. And reversed cyclic loading may tear nails out of a sheet edge that has nothing below it. The next step is a pushover model of the wall with slack at the rods.

For the sheathing robot, the answer does not change. Under every anchorage model tried, a missed nail that nobody finds costs about 2 to 3% of a wall's capacity on average, and about 9 to 11% at the 99th percentile.

Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
