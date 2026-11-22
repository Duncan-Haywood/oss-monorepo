---
title: "The wave loss that doubled was a damping force tipped on its side"
seo_title: "Near-field added resistance: the long-wave residual explained"
date: 2026-11-21
tags: [research, marine-hull]
description: "A near-field added-resistance formula doubled a 4 m boat's wave loss. The cause was tilted viscous damping, and the consistent form agrees with GB."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses to head seas. Its answer, a 3.4% to 4.2% range loss at a 30 W payload load, rests on one added-resistance formula, Gerritsma-Beukelman (GB). The [previous step](2026-11-21-marine-hull-nearfield-monohull-long-waves.md) swapped in a second formula, Boese's near-field pressure integration in the form the PDSTRIP manual documents. The loss jumped to 6.7% to 8.7%. Most of the jump came from waves 8 to 40 hull lengths long, which a 4 m boat simply rides. In those waves the added resistance should be close to zero, and it wasn't.

**The suspect was innocent.** The previous step blamed a missing second-order hydrostatic term. Before writing any code, this step went back to the PDSTRIP manual (chapter 17, text pulled out of its PostScript) and worked through that term. For a hull that only heaves and pitches it is exactly zero: the mean force it gives is proportional to the integral of depth times the fore-aft normal over the hull, and Gauss's theorem makes that vanish.

**The real cause sat in the motion model.** The strip model's viscous heave damping pushes back on the hull's absolute vertical velocity. In long waves the hull moves up and down with the wave at full speed, so this damping force stays finite even though the water barely moves relative to the hull. The near-field formula takes the pressure force on the hull and tilts it with the pitch angle. The tilted damping force then shows up as a steady drag of ½ ω B k |z|², which falls only slowly with wavelength. Computed directly, the tilted part matches that expression to within 1.4% at eight hull lengths. Rotating the hull's total force (mass times acceleration) instead of the pressure force alone is the form Pinkster's near-field theory uses, and it removes the residual. At eight hull lengths the near field drops from 19.1 to −1.6 N/m² (GB: 0.12).

**The boat's loss comes back down.** With that fix and no splicing, the 30 W loss is **3.08%** without the formula's convection term and **4.62%** with it. The near field had given 6.68% and 8.69% before; GB gives 3.39%.

**A missing term matters more than expected.** Pinkster's form has one more term that PDSTRIP's three-term list leaves out: the hull's displacement times the pressure gradient it moves through. We had expected it to shift results by under 10%. It cut every tank peak by a third. With it included, the convected near field lands next to GB on every check we have:

| check | GB | near field, consistent form |
|---|---|---|
| Kashiwagi tank hull, area / measured | 0.929 | 0.934 |
| Journée's five clean peaks, rms log ratio | 0.219 | 0.229 |
| 4 m monohull, 30 W loss | 3.39% | 3.04% |

All five pre-registered expectations were refuted as written. One failed only because its bar was set against the wrong quantity. The rest failed because the fix worked better than predicted or the extra term was bigger than predicted. The agreement in the table was read off the results, not predicted, and the displacement-times-gradient term still needs a mesh-convergence check before the paper treats it as a second estimate rather than a sensitivity. For now, the formula spread that the last two steps reported was mostly an inconsistent near-field form. Made consistent, the two formula families agree, the 3.4% to 4.2% bracket stands, and the monohull still leads every hydrofoil case up to 200 W.

Code, numbers and the pre-registered plan are in the [research log](../../research/marine-hull/LOG.md) (milestone 7zu).
