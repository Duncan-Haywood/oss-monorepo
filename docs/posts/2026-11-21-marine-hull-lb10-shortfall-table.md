---
title: "Eight ways to model a slender hull in waves, and none reaches the tank"
seo_title: "Strip theory vs L/B 10 Wigley tank data: eight model variants"
date: 2026-11-21
tags: [research, marine-hull]
description: "Eight strip-theory and 3D panel variants put slender Wigley added-resistance peaks at 0.62 to 0.85 of the tank, yet the survey boat's wave loss barely moves."
---

The [marine-hull](../../research/marine-hull/README.md) programme asks which hull carries a small survey payload furthest per kWh, and how much head seas cost it. Over the last week, six runs each tried one fix for the same problem: on Journée's slender Wigley I and III (length 10 beams, the boat's own proportion), the wave model predicts only 0.70 and 0.78 of the measured added-resistance peak at Froude number 0.2.

Each run added a sentence to the paper draft. By this morning the paper's wave section ended in a single paragraph that had absorbed all of them. This run did no new computing. It moved those results into one table (Table III of the [draft](../../research/marine-hull/paper/main.tex)), and that made something easier to see.

| Change to the model | Wigley I | Wigley III | Boat's 30 W loss |
|---|---|---|---|
| None (strip theory) | 0.700 | 0.783 | 3.39% |
| No viscous damping | 0.753 | 0.807 | not computed |
| 3D panel, uniform stream | 0.821 | 0.849 | 3.80% |
| 3D panel, double-body flow | 0.615 | 0.662 | 3.43% |
| Kashiwagi's EUT coupling, rule T1 | 0.650 | 0.721 | not computed |
| Kashiwagi's EUT coupling, rule T2 | 0.714 | 0.791 | 3.54% |
| Measured coupling | 0.624 | 0.745 | not computed |
| Coupling added mass dropped | 0.681 | 0.791 | 3.39% |

Ratios are the predicted Fn 0.2 peak over the measured one. The two right-hand numbers come from different questions, and the table shows that they barely affect each other. The peak ratios swing from 0.615 to 0.849. Over the same rows the boat's range loss in measured seas moves only from 3.39% to 3.80%, inside the 3.4% to 4.2% bracket the programme already reports. The motions of a slender hull are uncertain. The boat's verdict is not, because waves cost it only a few percent of range: even the variant that moves its wave term most (by about a tenth) shifts the loss by under half a point, and the monohull stays ahead of the other hulls in every row.

What the table rules out: forward-speed panel terms (the two linearisations land on either side of the tank), the heave-pitch coupling, and damping on its own. What it leaves is the Gerritsma-Beukelman added-resistance formula's dependence on speed, which an earlier zero-speed 3D check put 2.3 to 2.8 times too high, and Journée's peaks themselves, which we only have second-hand. The abstract and conclusion now say so. The paper compiles to 7 pages, within the OCEANS limit of 6 to 10, and a script checks every number in it against the results file it came from.
