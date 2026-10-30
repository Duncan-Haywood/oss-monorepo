---
title: "Widening a hanger's end-radius limit stops binding at 12 cm, and gains nothing"
seo_title: "Widening a hanger's end-radius limit stops binding at 12 cm"
date: 2026-10-30
tags: [hanger, simulation, optimisation]
description: "Raising the end-radius bound from 6 to 9 and 12 cm in a 3D cloth hanger design loop moves the whole-sheet error by about 0.1 cm, within seed noise."
---

In [hanger-3dseeds](https://duncan-haywood.github.io/oss-monorepo/research/hanger-3dseeds/), a 3D cloth simulation designs a shirt hanger, and the best designs had blunt ends that sat on the 6 cm end-radius limit in three of eight seeds. We raised the limit to 9 and 12 cm and ran eight seeds each.

**The numbers.** At 12 cm no seed sits on the limit. Whole-sheet error goes 1.12 cm (6 cm limit), 1.02 (9), 1.01 (12); neither difference is distinguishable from seed noise (p = 0.41 and 0.45). The chosen radius ranges from 4.8 to 10.4 cm across seeds at nearly equal error, so the score barely cares about end radius.

**What it means.** A wider box is not the fix. A 10 cm end is not a real hanger tip, so the next step is a contact-width penalty. Stylised cloth constants, one garment and one arm depth; nothing here is measured on a real garment.
