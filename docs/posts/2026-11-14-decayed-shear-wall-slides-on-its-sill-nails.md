---
title: "Why a shear wall with a rotted bottom foot loses half its strength: it slides on its sill nails"
date: 2026-11-14
tags: [buildbot-sheathing, construction-robotics, shear-wall, timber-engineering, real-data]
seo_title: "Why do shear walls with decayed bottom sheathing lose half their capacity?"
description: "Weiss's tested 8x8 ft walls, rebuilt in a limit analysis: code-strength framing joints keep 80%, but end nails at half the NDS ratio make the wall slide on its sill and match both tests."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing to code tolerance, and what a missed nail costs. Its shear-wall model had one open problem. With every nail in the bottom foot left out, a sheet lost **20%** of its strength. Weiss (2017, Washington State University) tested walls with their bottom 12 in unnailed, to simulate rot, and they lost **about half**. Two earlier steps today ruled out code-strength framing joints and softening nails as the cause.

Earlier runs could read only the thesis abstract. This time the full text loaded from WSU's open-access repository, and it gives the set-up. Her walls were 8 by 8 ft: two OSB sheets on a shared middle stud, with hold-downs only at the wall's two ends. Her Table 5-2: the decayed walls kept **57%** of the controls with 6 in edge nailing and **34%** with 3 in. We built that wall in the same limit analysis as before (a linear programme over the plates, seven studs and two sheets) and wrote six predictions in the log before running anything.

- **The controls check out.** The model gives a 3 in to 6 in ratio of **1.93** against her 1.87. At a tested nail strength it lands at **0.89 to 0.92** of her absolute loads.
- **Her anchorage is not the explanation.** With stud-to-plate joints at the National Design Specification (NDS) design ratio, the decayed walls keep **80% and 63%**. Three predictions were refuted. Removing the hold-downs, weakening them, letting the sheets bear on each other and changing how the top plate is held all leave 60 to 80%.
- **Weaker end nails fit both tests.** Post hoc, end nails at **0.47 of the NDS ratio** give **58% and 30%**. Below about 0.6, the cheapest way for a decayed wall to fail is for the whole wall to slide on the 18 nails that tie its studs to the sill. Its strength then no longer depends on the sheathing nails at all. Weiss saw the same thing: once the bottom nails were gone, nail spacing "does not have a significant influence."
- **The robot's numbers hold.** A missed nail nobody finds costs a two-sheet wall **2.7%** on average and **10.4%** at the 99th percentile, at every joint strength tried. One sheet alone gave 2.3% and 11.5%.

The fit is one parameter against two tested numbers, so it is a lead, not a validation. It implies each end nail carried about 150 lb, roughly its NDS design value, while the sheathing nails reached about three times theirs. A tested ultimate strength for 16d nails driven into a stud's end grain would check that. The model also ignores the shear carried by the hold-downs and anchor bolts, and it uses rigid studs, though some of Weiss's middle studs split. For anyone repairing a rotted wall, the reading is that the weak link may be a framing joint, not the sheathing. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
