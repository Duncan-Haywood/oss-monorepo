---
title: "Is the near field's pressure-gradient term a grid artefact? A convergence check on Wigley I"
seo_title: "Near-field added resistance: panel and station convergence"
date: 2026-11-21
tags: [research, marine-hull]
description: "The X . grad p term that cut every Wigley added-resistance peak by a third moves under 2.4% from 16 to 24 panels and under 0.6% from 20 to 60 stations."
---

The [marine-hull](../../research/marine-hull/README.md) programme estimates how much range a 4 m solar survey boat loses in head seas. Its answer, a 3.4% to 4.2% loss at a 30 W payload load, rests on one added-resistance formula, Gerritsma-Beukelman (GB). The last three steps built a second formula family, near-field pressure integration, on the same strip sections, and [carried it to the boat](2026-11-21-marine-hull-nearfield-monohull-long-waves.md). In its consistent form (Pinkster's rotation term plus a displacement-times-pressure-gradient term, "X . grad p") it agreed with GB on every check. But that agreement leaned on the X . grad p term, which lowered every tank peak by a third. It is built from second derivatives taken by finite differences along the hull, which is exactly the kind of term that can be a grid artefact. So this step changed the grid and nothing else.

**What was run.** Wigley I at Froude number 0.2 (the hull where the programme's models fall shortest of Journée's measured peak), with panels per half section at 12, 16, 20 and 24 and stations along the hull at 20, 30, 40 and 60. Six expectations were written down before the code.

**The term is converged.** At the near-field peak the X . grad p term is -11.38 (sigma units) at the working grid of 16 panels and 30 stations. Going to 24 panels moves it by 2.4%, and going to 60 stations by 0.4%. Its four station values, -11.45, -11.38, -11.41 and -11.43, stay within 0.6% of each other and do not change in one direction, so no order of convergence can be read from them. That refuted one expectation as written: it asked for an order at least 0.8 times the full near field's, about 1.7. The term is less sensitive to stations than the quantities it was compared against, not more. Its finite differences are not the weak point.

**Everything moves together with panels.** From 16 to 24 panels, GB's peak rises 1.4%, the near field without the gradient term 1.8%, and the full near field 1.3%. So the ratio of the full near field to GB (with its reflection term) stays at 1.014 to 1.025 on every grid. The full near field's peak over Journée's measured value is 0.714 to 0.723 on every grid with at least 16 panels and 30 stations. GB's control spread over all seven grids was 7.9%, against a bar of 3%. That is almost entirely the coarse 12-panel grid; without it the spread is 1.9%. So 16 panels underestimates every row by about 1% to 2%, and the programme's 0.70 shortfall on this hull is not a panel count problem.

**The long-wave tail is the model.** After the previous step the near field still left a small negative value in very long waves, where GB goes to zero. From 30 to 60 stations it changes by 0.8%, with a Richardson estimate 0.4% beyond the 60-station value. A differencing error would have fallen to about a quarter. It is in the strip model's relative-velocity diffraction approximation, not in the grid.

**On the boat.** On a finer grid (24 panels, 40 stations) the 4 m monohull's 30 W loss is 3.41% with GB and 3.06% with the consistent near field, each 0.02 to 0.03 points above the working grid, and the monohull still leads every hydrofoil case up to 200 W. So the near field can go into the paper as a second estimate rather than a sensitivity: two formula families, 3.1% and 3.4%. Next is to settle that long-wave tail by putting the viscous damping on the relative heave velocity, which changes the wave excitation as well.

Code, numbers and the plan committed before the run are in the [research log](../../research/marine-hull/LOG.md) (milestone 7zv).
