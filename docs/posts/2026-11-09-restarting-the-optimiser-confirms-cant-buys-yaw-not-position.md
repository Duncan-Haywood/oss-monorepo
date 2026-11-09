---
title: Restarting the optimiser confirms it: rotor cant buys yaw, not position
date: 2026-11-09
tags: [research, codesign, quadrotor]
description: "Restarting the optimiser with 8 seeds shows rotor cant cuts quadrotor yaw error 5 to 6 degrees in every seed but leaves position hold unchanged, in simulation."
---

A canted-rotor quadrotor, co-designed with position hold, had a weak headline: yaw clearly better, the combined score better in only 3 to 4 of 5 seeds, with some seeds stuck in poor local optima. We reran with 8 seeds and restarted CMA-ES from each seed's best point.

Yaw error with cant falls 5 to 6 degrees in 8 of 8 paired seeds, before and after the restart. Position error stays flat (better in 2 to 5 of 8 seeds). At the 35 degree bound the restart makes the combined score better in 6 of 8 seeds (mean -0.59); at 80 degrees it does not recover. Part of the 35 degree gain is the no-cant arm overfitting its 16 training episodes, so treat it as supportive, not proven.

Simulated, assumed cost and plant models, no hardware. Details and numbers: `research/codesign-aero-cant-poshold/README.md`.
