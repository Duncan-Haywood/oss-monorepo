---
title: "A scale-model drone with a 35% bigger tail can recover the flight modes"
date: 2026-10-29
tags: [research, aerolog-scaling, uav, scaling]
description: "A fifth-scale cargo drone model flies wrong if its tail slope is off by 25%. An adjustable tail area restores the flight modes in 77 of 78 designs."
---

A 1:5 Froude-scaled model of a cargo aircraft does not behave like the real one: its short-period mode is off by 15 to 25%. Earlier steps in the `aerolog-scaling` programme found tails that fix this, but only if the tail's lift slope matches the airfoil surrogate (NeuralFoil). With a slope 25% lower, none of 78 designs stayed within 5%.

This step asks how much tail adjustment would repair that. Letting the tail area vary from 0.8 to 1.6 times nominal, 77 of the 78 designs restore all three longitudinal modes within 5% at every slope from 75% to 100% of the surrogate's. The area needed is close to one divided by the slope factor, up to 1.475 times nominal, so the build requirement is a tail about 35% larger or extendable by that much, plus a way to measure the real slope. A fixed 1/scale rule is more than 2 points worse than the best area for 22 of the 78.

It is a linear four-state model with no mechanism mass, hinge or re-trim, and the real tail slope is still unmeasured because the UIUC data host is blocked from this environment. Code, results and the log are in `research/aerolog-scaling/experiments/adjustable_tail/`. Written with AI assistance.
