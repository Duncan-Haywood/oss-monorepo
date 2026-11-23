---
title: "Putting the last dropped term back into strip theory's sections made its drift force worse"
seo_title: "Strip theory body condition x-derivative: a negative result"
date: 2026-11-23
tags: [research, marine-hull, seakeeping, added-resistance]
description: "We restored the diffraction flow's own longitudinal derivative in each strip section's body condition. The fixed hull moved away from the 3D answer."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m survey boat loses in head seas. One estimate integrates second-order pressure over the hull using strip theory's first-order flow, and the last few steps have taken that flow apart against a 3D panel solution (Capytaine, 2,560 panels per hull, zero speed). [Two steps ago](2026-11-23-marine-hull-bow-reflection-strip.md), putting the incident wave's surge velocity back into each section's body condition made a fixed hull reflect at the bow. Its drift force rose from a third of the 3D value to 0.73 to 0.90 of it. [The last step](2026-11-23-marine-hull-consistent-excitation.md) showed the free hull still went wrong, and blamed the one term strip theory still drops: the diffraction disturbance's own x-derivative on the hull's longitudinal normal.

This step put that term back. The plan and six expectations went into the [research log](../../research/marine-hull/LOG.md) (milestone 7zzb) before any code was written. One held.

**How.** On a hull surface y = Y(x, z), the 3D body condition written in a section's own normal gains Y_x n_y (φ_I,x + φ_D,x). The incident part was already in. The disturbance part depends on the solution, so it is added by fixed-point passes. Each section is re-solved with the station-differenced x-derivative of the previous pass as an extra normal velocity, until the drift force changes by under 10⁻⁴ ρgζ²B²/L or 12 passes are used. A test checks that a settled flow satisfies its own corrected body condition to 10⁻⁶.

| band λ/L 0.5 to 2.0, over the 3D | tank hull (L/B 6.67) | 4 m monohull (L/B 10) |
|---|---|---|
| fixed hull, incident surge term only | 0.895 | 0.732 |
| fixed hull, plus disturbance term | **0.741** | **0.660** |
| free hull, incident surge term only | 1.362 | 1.092 |
| free hull, plus disturbance term | 1.189 | 0.999 |

**The fixed hull moves away from the 3D.** Both the waterline term and the velocity term lose ground. At λ/L 1 the incident-disturbance velocity term had nearly reached the 3D sign (−0.009 on the tank hull against −0.399). With the new term it goes back to +0.063. The monohull's free number lands on the 3D (0.999), but it does so over a fixed-hull flow that got worse, so it is two errors cancelling, not agreement.

**On the fuller tank hull it does not settle.** The monohull settles within 4 to 12 passes everywhere. On the tank hull, 10 of 14 points still move after 12 passes. At λ/L 8 the passes diverge: an unplanned 200-pass run ends at about −5×10¹² in the same units. In the band the 200-pass values match the 12-pass ones to 0.003, so the table above does not depend on the cap.

**Why.** In 3D this term is how the flow turns around the hull's ends. A 2D section has no way to carry anything along the hull. So the term only comes back as a local source, biggest where the hull slope Y_x is biggest (the ends), which is also where station differences are least accurate. This closes the section-by-section route at this order. Depth decay did nothing, the incident surge term fixed the fixed hull but broke the free one, and the disturbance term undoes part of that fix. The programme keeps today's strip near field for its speed comparison, with the 3D panel solution as its reference where both exist.

**Limits.** Zero speed, heave and pitch only, one strip grid and one 3D mesh. No relaxation or Krylov acceleration was tried, so a converged tank-hull value in long waves may exist that plain passes do not reach.

Reproduce it with `experiments/run_dx_fixed_point.py` (about 12 minutes, Capytaine 3.0.0). The numbers are in [`results_dx_fixed_point.txt`](../../research/marine-hull/experiments/results_dx_fixed_point.txt).
