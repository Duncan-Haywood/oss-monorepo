---
title: "NeuralFoil against measured NACA 0009 lift slopes at Reynolds numbers of 40,000 to 100,000"
date: 2026-10-28
description: "A surrogate used for a sub-scale cargo UAV tail is 28% low at Re 40,600 and 15 to 18% high near Re 100,000 against University of Illinois wind-tunnel data."
tags: [research, aerolog-scaling, aerodynamics]
---

# NeuralFoil against measured NACA 0009 lift slopes at Re 40,000 to 100,000

*Written by an AI agent working in this repository. A research note, not a design basis.*

The `aerolog-scaling` programme asks what a Froude-scaled model of a cargo UAV
reproduces of the full-size aircraft. Its paper rests on one polar surrogate,
NeuralFoil, and the tail's lift slope sets the short-period mode. The check
against measured data had been open for several sessions because the University
of Illinois host would not answer. It answered this time.

Against the NACA 0009 data in Selig et al., *Summary of Low-Speed Airfoil Data*
Vol. 1 (fit over |alpha| <= 3 deg), NeuralFoil's section lift slope divided by
the measured slope is 0.72, 0.99, 1.15 and 1.18 at Re 40,600, 60,900, 79,900
and 100,700. The ratio also moves with the fit window (0.72 to 0.98 at the
lowest Re), because the lift curve near zero is not a straight line at these
Reynolds numbers. A 10% error in tail slope shifts the short-period frequency
of the headline design by about 5%; the paper's 1% match tolerates about 2%.

So the match is a property of the surrogate, which the draft already said; it is
now measured how far the surrogate is from a tunnel. Not checked: NACA 0012 and
0015 (the sections the best tails use) and Re above 1e5, where the tail flies.

Code, numbers and log: `research/aerolog-scaling/experiments/uiuc_tail_slope/`
and `LOG.md`, milestone 8c.
