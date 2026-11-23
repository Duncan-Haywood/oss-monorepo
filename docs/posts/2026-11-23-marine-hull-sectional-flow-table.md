---
title: "Three fixes to strip theory's near-field flow, one table: each fixes one column and breaks another"
seo_title: "Strip theory near-field drift: three body-condition fixes compared"
date: 2026-11-23
tags: [research, marine-hull, seakeeping, added-resistance, paper]
description: "Five strip body conditions against a 3D panel near field on two hulls, restrained and free: no row comes closer to the 3D in both columns."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses in head seas. Over the last three steps it tried to make strip theory's flow good enough for Pinkster's near-field drift formula. Each step put back one term of the 3D body condition that slender-body ordering drops from each cross-section, then compared the result with a full 3D panel solution (Capytaine) at zero speed.

Those three steps lived in three log entries and four long sentences of the paper draft. This step puts them in one table (Table IV in [the draft](../../research/marine-hull/paper/main.tex)). A short script, `paper/make_table_sectional.py`, writes the table from the three committed results files. It recomputes every band area from the per-wavelength rows and checks it against what each run printed: 18 of 18 match to three decimals. Nothing new was run.

Band area is the near-field added resistance integrated over λ/L 0.5 to 2.0, divided by the 3D value (1 is right). The tank hull is a modified Wigley at L/B 6.67, the monohull is L/B 10:

| Sectional body condition | Restrained, tank | Restrained, monohull | Free, tank | Free, monohull |
|---|---|---|---|---|
| Relative velocity (strip default) | 0.406 | 0.332 | 1.043 | 0.892 |
| + depth decay of the incident wave | 0.411 | 0.339 | 1.092 | 0.917 |
| + incident surge on the longitudinal normal | **0.895** | **0.732** | 1.262 | 1.115 |
| same, motions from its own exciting force | (as above) | (as above) | 1.362 | 1.092 |
| + the disturbance's own x-derivative | 0.741 | 0.660 | 1.189 | 0.999 |

Read down a column and things improve. Read across a row and they don't. The incident-surge term is what lets the restrained flow reflect at the bow: without it the strip waterline term is exactly zero, against the 3D's 0.98 at λ/L 1. But the same term makes the free near field worse. Driving the motions consistently makes it worse again on the tank hull. The last term pulls the restrained flow back away from the 3D, and on the tank hull its fixed-point passes never settle in long waves. The monohull's 0.999 in the free column comes from cancellation over a restrained flow that got worse, so it is not agreement.

So the default strip near field stays in the model. Its band total lands close to the 3D, but only because two wrong terms cancel, and the paper now says that in one line and points to the table. Next is the Fn 0.2 comparison with that flow, then the finer-grid checks at higher speed.

The table, its generator and the test that pins it are in [`research/marine-hull/paper/`](../../research/marine-hull/paper/) and [`tests/test_table_sectional.py`](../../research/marine-hull/tests/test_table_sectional.py).
