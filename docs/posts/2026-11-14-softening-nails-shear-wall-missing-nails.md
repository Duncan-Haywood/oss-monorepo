---
title: "Softening nails do not explain why shear walls with missing nails lose half their strength"
date: 2026-11-14
tags: [buildbot-sheathing, construction-robotics, shear-wall, timber-engineering, real-data]
seo_title: "Do softening nails explain shear wall capacity lost to missing nails?"
description: "A 4x8 OSB shear-wall sheet pushed over on a tested 8d nail curve still loses only 20% with its bottom foot unnailed. Real walls lose about half."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing to code tolerance and what a missed nail costs. Yesterday it built a simple shear-wall model to score the robot's misses: rigid framing, a rigid sheet, and every nail carrying the same load at any slip. That model has one known problem. With every nail in the bottom foot left out, it loses **20%** of its strength. Weiss (2017, WSU) tested walls nailed that way, and they lost **about half**.

This morning's milestone ruled out weak stud-to-plate joints as the cause. This step tests the next candidate: real nails do not hold a constant load. They peak at about a centimetre of slip and then soften. If the corner nails are already softening before the middle ones have peaked, a sheet with fewer nails could lose more than its nail count suggests.

We gave every nail the tested load–slip curve of an 8d common nail through 7/16 in OSB into SPF (Shameli Derakshan, Zhou and Ni 2019: 0.97 kN peak, 0.5 kN/mm stiffness, 80% of the peak left at 29 mm), then pushed the sheet over step by step.

- **The model behaves like a real wall.** The intact sheet peaks at **9.8 kN (551 plf) at 2.3% drift**. Its strength at 4, 3 and 2 in nail spacing is within 6% of the code table's ratios.
- **Softening changes nothing.** With the bottom foot unnailed, the sheet loses **20.1–20.4%** at every slip-at-peak we tried (6 to 15 mm, which the paper does not tabulate). That holds on the cyclic curve too, and with a nail that loses a fifth of its load a millimetre past the peak. The rigid-plastic model said 20.4%.
- **The reason is geometric.** At the sheet's peak, the perimeter nails all slip about the same, 11–12 mm. Only a few field nails near the centre of rotation lag at 3–4 mm. Nails that slip together peak together, so how sharply each one peaks does not matter.
- **The robot results stand.** A missed nail nobody finds still costs 2.4% of its sheet on average and 11.8% at the 99th percentile. Nailing the joint edges at 4 in still carries every miss in 99.98% of sheets.

We wrote five predictions in the log before computing anything. Four held. The one that mattered, that softening would explain Weiss's walls, was refuted at every setting.

This is a negative result, and a useful one. Of the three explanations the last milestone left open, two are now ruled out with tested inputs: framing joints at code strength and softening nails. What is left is the anchorage. In this morning's model, taking the hold-downs away moved the loss to 64–100%. The next step is a model of hold-downs and sill-plate uplift, or Weiss's full thesis, to see how her walls were held down. The limits: monotonic loading only (most wall tests are cyclic), one nail study, and a slip-at-peak that is swept rather than measured. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
