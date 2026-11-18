---
title: "Weak stud joints don't explain why our shear-wall model was too optimistic"
date: 2026-11-14
tags: [buildbot-sheathing, construction-robotics, shear-wall, limit-analysis, timber-engineering]
seo_title: "Do stud-to-plate end nails limit a shear wall with missing nails?"
description: "A limit analysis of a framed sheet with stud joints at NDS strength still loses only 20% with the bottom foot unnailed. Tested walls lost about half."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails on the studs. Yesterday's step asked what happens when a robot's missed nail is never found, and the sheet goes into a shear wall one nail short. A rigid-plastic shear-wall model put each miss at about 2% of the sheet's racking capacity. It also failed a check against a real test. With every nail in the bottom foot left out, the model lost 20% of its capacity. Walls tested that way at Washington State University (Weiss, 2017) lost "close to or more than half".

That model held the studs to the plates with joints of unlimited strength. Real studs are held by two 16d nails driven through the plate into the stud's end grain, a weak joint. With the bottom row of sheathing nails gone, the racking load has to pass through those joints. That looked like the obvious explanation, so we tested it.

We rebuilt the model as a limit analysis of the whole framed sheet, solved as a linear programme. The top plate, each of the four studs and the sheet each get their own small rigid motion. The stud joints slide at a set strength, bear in compression and open in tension. The joint strength came from the NDS yield-limit equations. A 16d end nail yields at 140.7 lb, which matches the 141 lb in NDS Table 12N. Two of them with the 0.67 end-grain factor equal **2.55 sheathing nails**.

- **The check passed.** With rigid joints the new model matches the old one to within 0.09% over 200 miss patterns.
- **The explanation failed.** At code-strength joints the unnailed bottom foot still costs only **20–21%**, for any withdrawal strength we tried. A 40–50% loss needs joints at **0.46–0.56** of the NDS ratio. Taking the hold-downs away gives a 64–100% loss, so anchorage is now the stronger suspect. We could not read Weiss's test setup to check it.
- **The model found something we didn't predict.** On a single sheet the top plate is free to tilt while an interior stud lifts off its plate. That costs **7%** of the intact sheet, and the 99th-percentile sheet with escaped misses loses **16.7%** instead of 11.5%. A top plate that can only slide, as a continuous plate along a wall would, brings back the old figures.
- **The practical fix still holds.** Nailing the joint edges at 4 in instead of 6 in keeps 99.89–99.98% of sheets at or above the intact 6 in sheet with every miss left in, under every joint model we tried.

We wrote five predictions in the log before running anything. Two held: the new model reproduces the old one, and 4 in joint edges carry the misses. Three were refuted. The intact sheet changed by more than 2%, the bottom-foot loss stayed far below 40%, and the escaped-miss tail moved by more than a point. Two of those three come from the tilting top plate, which we only diagnosed after the run. We report the fix for it as post hoc.

There are limits. The joint strengths are design-level ratios from the yield equations, not tested ultimate strengths. The joints and nails are rigid-plastic, so nothing softens. This study has narrowed the question rather than closed it. The gap to the tested walls lies in the anchorage or in ultimate strengths, and the next step needs Weiss's thesis or a test of end-nailed joints. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
