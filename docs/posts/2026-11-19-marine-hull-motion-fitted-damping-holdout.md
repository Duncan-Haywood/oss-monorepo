---
title: "Fit the damping to the motions, hold out the added resistance: the wave loss is 4.2%, not 3.7%"
seo_title: "Motion-fitted damping, held-out added resistance: 4.2% wave loss"
date: 2026-11-19
tags: [research, marine-hull]
description: "Damping fitted to Kashiwagi's heave and pitch alone leaves strip-theory added resistance 13% high, so a 4 m survey boat's 30 W wave loss is 4.2%."
---

Today's [marine-hull](../../research/marine-hull/README.md) steps put a 4 m survey boat's range loss in waves at 3.7%. That figure came from a viscous damping value fitted so that strip theory matched the measured added resistance on Kashiwagi's slender Wigley tank model ([7zd](2026-11-19-marine-hull-wigley-tank-data-strip-theory-vs-stawave2.md)). It had never been checked on data it wasn't fitted to. The same paper also measures heave and pitch separately, so the motions can set the damping and the added resistance can test it.

The plan and seven expectations were committed before the run. The method: separate heave and pitch damping fractions, a 41 by 41 grid from 0 to 10% of critical, fitted to the 32 heave and pitch points between λ/L 0.5 and 2.0. No added-resistance point goes into the fit.

What came out ([results](../../research/marine-hull/experiments/results_motion_damping_holdout.txt)):

- **The motions want heave damping and no pitch damping.** The best fit is 3.75% of critical in heave and 0 in pitch. Heave rms error is 0.127 and pitch 0.138. That is better than any single shared fraction, and in heave better than every published method plotted in the same paper (0.145 to 0.375).
- **The held-out added resistance stays 13% high.** With that damping, strip theory plus STAWAVE-2's reflection term gives 1.134 times the measured mean area, against 1.189 with no damping at all. I had expected 0.95 to 1.12, so the hold-out refuted it. The damping that fits the motions removes only about a quarter of the excess.
- **So the excess is in the added-resistance formula, not the motions.** The earlier fit reached 1.00 by damping pitch too, which the pitch data reject (its pitch rms was 0.213).
- **The boat's 30 W loss is 4.18%**, and 4.10% to 4.23% across the near-best grid cells. Dropping the heave-pitch added-mass coupling instead gives 4.13% to 4.20%. The monohull still out-ranges every hydrofoil case up to 200 W.

The best estimate is now a range, 3.7% to 4.2%. The low end lets damping absorb a formula error; the high end keeps the motions right and the formula as it is. Both sit inside the programme's stated 2.5% to 4.3%, and neither changes the hull ranking.

The limits: one motion series, one hull, one Froude number. Pitch damping sits at the grid's lower edge. I haven't yet split the 13% excess between the radiated-energy term and the reflection term, and that split is the next step.
