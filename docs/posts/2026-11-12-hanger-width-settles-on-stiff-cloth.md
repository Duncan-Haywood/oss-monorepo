---
title: "Our two cloth models agree on the hanger once the cloth is stiff enough, and the KES table says how stiff"
seo_title: "Robot hanger arm width in cloth simulation: shear vs stretch stiffness from KES data"
date: 2026-11-12
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, kes-fb]
description: "With shear set from measured KES G, stretch stiffness still moves a shallow hanger arm's best width by 1 cm, but above about 800 N/m all four fabrics pick the 2D model's answer."
---

Yesterday's step in the [`hanger-codesign`](../../research/hanger-codesign/)
programme found a confound. In our 3D cloth sheet, the shear springs were
tied to the stretch stiffness EA, so every "EA" sweep also swept shear. On a
simulated drape test, shear carried most of the effect. The day before that,
an EA sweep had moved the best arm width of a shallow 3 cm hanger arm by
[1.5 cm](2026-11-11-hanger-width-follows-stretch.md). Was that shear too?

This step set the shear spring to each fabric's measured KES shear rigidity
(26 to 89 N/m) and swept EA on its own. It ran 126 converged cases across
four fabrics, with predictions committed before the run.

- **Stretch is still most of it.** EA 40 to 800 N/m moves the best width by
  1.0 cm on both the cotton jersey and the suiting (+2.0 to +1.0 cm). Shear
  accounts for the remaining third of the old 1.5 cm.
- **Above about 800 N/m the choice settles.** At EA 800, 3200 and the
  stiffness derived from the KES data, every fabric picks +1.0 cm, with one
  exception: the shirting at 800 N/m picks +1.5 cm. At those stiffnesses the
  margins are 0.02 to 0.08 cm, well clear of the solver's own wobble (at
  most 0.008 cm).
- **That is the 2D chain's answer.** At the KES-derived stiffness, the 3D
  sheet and the 2D chain pick the same width on all four fabrics. The half
  centimetre of disagreement we chased for three steps is a soft-cloth
  effect.

Where did the KES-derived stiffness come from? The table that gave us bending
rigidity, weight and shear rigidity also lists tensile linearity (LT) and
tensile energy (WT). With the tester's standard 500 gf/cm maximum load, those
two numbers give the strain at that load, and a secant stiffness of 2,400 to
15,500 N/m. The load is an assumption, because the paper does not state it.

But a garment hanging on a robot's hanger pulls on its shoulder with a few
N/m, not 490. A power-law curve that matches both LT and WT puts the
stiffness at that load near 1,300 to 1,900 N/m for the suiting and over
5,000 for the elastane jersey, so their choice is settled. The cotton jersey
(about 250 to 370 N/m) and the shirting (700 to 1,050) land right in the band
where the choice flips between +1.0 and +1.5 cm.

So the one fabric measurement still missing is not another KES summary number.
It is the toe of the tensile curve: how much a strip of T-shirt jersey
stretches under the weight of a T-shirt. A spring scale and a ruler can
measure that.

Simulation only, produced with AI assistance; nothing here is a measurement
of real cloth. Code, numbers and the full log are in
[`research/hanger-codesign`](../../research/hanger-codesign/README.md).
