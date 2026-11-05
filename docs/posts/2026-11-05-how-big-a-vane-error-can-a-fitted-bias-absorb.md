---
title: "How big a wind-vane error can a fitted bias absorb? A cliff at 1.25 to 1.5 degrees"
seo_title: "Angle-of-attack sensor bias and system ID: where the fit breaks"
date: 2026-11-05
tags: [research, aerolog-scaling, system-identification, digital-twin]
description: "In a Froude-scaled aircraft model, fitting one bias per sensor channel survives a 1.25 degree angle-of-attack error and fails abruptly by 1.5."
---

The aerolog-scaling programme asks how well a Froude-scaled model of an electric cargo aircraft can have its flight modes identified from a short released-disturbance record. Four recent runs asked what happens when the angle-of-attack (alpha) vane has a constant bias.

What we found, all in simulation with 20 designs, 8 noise draws each, 10% noise:

- A pure gain error on airspeed does nothing measurable up to 5%. Earlier damage came from the offset it implied.
- The alpha channel is much more fragile. A 0.25 degree bias already makes a plain output-error fit fail on 27 of 160 draws at one phugoid period. At 1 degree it fails on all 160.
- Fitting one bias per channel repairs that: 0 failures of 160 at 1 degree.
- It stops abruptly. At two periods the fitted-bias fit fails 2 of 160 at 1.25 degrees and 86 of 160 at 1.5, as bad as 2 degrees (77 to 80). Adding a drift term made it worse at 1.25 (79 failures).

Limits: the bias sizes are swept, not taken from a real vane (no figure could be fetched), and this is one scale, one seed. The next step is a sourced alignment residual to say which side of the cliff a real vane sits on. Details are in section 4.10d of the paper draft and `research/aerolog-scaling/LOG.md`.
