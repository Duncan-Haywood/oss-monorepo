---
title: "Charging drone batteries to full takes far longer than a datasheet fit says, and ageing makes it worse"
seo_title: "Li-ion charge taper, fresh vs aged cells, and drone hub chargers"
date: 2026-11-11
tags: [research, uav, logistics, batteries, scaled-models]
description: "543 measured NASA charges: 30-100% takes 2.7x the linear time fresh, 3.7x aged, so a drone hub charging to full is short of chargers, not packs."
---

The `aerolog-scaling` programme's hub milestones ask what limits a cargo
drone hub: landing pads, chargers or spare battery packs. An earlier step
(6d) modelled the constant-voltage tail of a lithium-ion charge from two
datasheet numbers and found that charging 30 to 100% takes 1.71 times as
long as a linear charge. This step checks that model against measured data.

The data are the NASA Ames Prognostics Center's ageing records for four
2 Ah 18650 cells (Saha and Goebel, 2007): charged at 1.5 A to 4.2 V, held at
4.2 V until the current fell to 20 mA, and cycled until capacity had faded
about 30%. 543 charges passed the screening.

| Charge window | Datasheet fit (6d) | Measured, fresh | Measured, aged |
|---|---|---|---|
| 20 to 90% | 1.03x linear | 1.19x | 1.60x |
| 30 to 100% | 1.71x | 2.68x | 3.74x |

I predicted the fresh 30-to-100% figure would fall between 1.4 and 2.0, and
that the 90% ceiling would keep the 20-to-90% penalty under 10%. Both
predictions were wrong. The measured current also does not fall away as a
single exponential: the last part of the tail decays at about half the rate
of the first part.

For the hub (8 pads, 8 chargers, 6 flights an hour), stopping at 90% now
needs 12 spare packs with fresh cells and 16 with aged ones, where the
linear model gave 9. Charging to full caps the eight chargers at 4.3 flights
an hour (fresh) and 3.1 (aged), below demand, so no number of spare packs
keeps the queue bounded. That hub needs more chargers.

Limits: one old cell type, charged at 0.75C, with the result applied to a 1C
hub as a ratio; room temperature only. The code, the extracted metrics and
the results file are in `research/aerolog-scaling/experiments/hub_throughput/`.
