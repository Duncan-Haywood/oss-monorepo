---
title: "Damping the relative heave velocity, not the absolute one: what changes in a small boat's wave loss"
seo_title: "Relative vs absolute viscous damping in strip theory"
date: 2026-11-22
tags: [research, marine-hull, seakeeping, added-resistance]
description: "With strip-theory viscous damping on the relative heave velocity, the tank motions fit as well and a 4 m boat's 30 W wave loss moves 0.02 points."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses in head seas. Its strip-theory motions use an equivalent viscous heave damping, fitted to Kashiwagi's measured tank motions. Until now that damping force pushed against the hull's *absolute* vertical velocity. [Two steps ago](2026-11-21-marine-hull-nearfield-viscous-tilt.md) this turned out to be what made PDSTRIP's near-field added-resistance formula blow up in long waves: the formula integrates the pressure force on the hull, the pressure force carries the damping force, and pitch tilts that force into a steady drag.

The fix then was on the drift-force side, using Pinkster's form instead of PDSTRIP's. This step tried the fix on the motion side: put the damping force on the *relative* vertical velocity between hull and water. In a long wave that velocity goes to zero, because the boat just rides the wave. We wrote down six expectations in the [research log](../../research/marine-hull/LOG.md) (milestone 7zw) before writing the code.

**The motions need more damping, and fit about as well.** Near resonance the water's own vertical velocity cancels part of a relative-velocity force. To match the same measured motions, the fit picks 8.75% of critical heave damping where the absolute form picked 3.75%. The fit is a shade worse (sum of squared errors 0.515 against 0.496), and the heave and pitch errors move by 0.003.

**No number the paper uses moves much.**

| check | absolute damping | relative damping (refitted) |
|---|---|---|
| tank hull, held-out added-resistance area / measured | 1.134 | 1.138 |
| Journée Wigley I, Fn 0.2 peak / measured (GB) | 0.700 | 0.696 |
| 4 m monohull, 30 W loss, Gerritsma-Beukelman | 3.39% | 3.42% |
| 4 m monohull, 30 W loss, consistent near field | 3.04% | 3.29% |
| 4 m monohull, 30 W loss, PDSTRIP's form as written | 8.69% | 5.94% |

The two added-resistance formulas now agree to 0.13 points instead of 0.35. The 3.4% to 4.2% bracket stands, and the monohull still leads every hydrofoil case up to 200 W.

**Two expectations failed.** We expected relative damping to bring PDSTRIP's long-wave residual down to its zero-damping size. It cut the residual 13 times at eight hull lengths and 30 times at sixteen, but what's left is still about twice the zero-damping value. The strip model's relative velocity is an average over the waterplane, and at finite wavelength the hull doesn't follow the wave exactly. We also expected the near field's monohull loss to move by less than 0.15 points; it moved 0.25, toward GB.

**What this settles.** Whether the damping acts on the absolute or the relative velocity matters for one quantity: PDSTRIP's own rotation term. Pinkster's form already avoids that problem. The two forms are identical at zero damping, and the near field's small negative tail in long waves is the same at zero damping. So that tail comes from the strip model's relative-velocity treatment of diffraction, not from the damping. The next test is the near field on full 3D panel diffraction potentials at zero speed, checked against Maruo's far-field formula, which doesn't use that approximation.

Code, the pre-registered plan and the full results are in the [research log](../../research/marine-hull/LOG.md) and `experiments/results_relative_damping.txt`.
