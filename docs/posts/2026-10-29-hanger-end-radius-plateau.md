---
title: "Making a simulated coat hanger blunter stops helping at about 6 cm"
seo_title: "Hanger design in simulation: does a larger end radius reduce garment drape error?"
date: 2026-10-29
description: "Lifting the end-radius cap of a simulated 3D-designed hanger from 6 to 10 and 15 cm left the drape error flat (1.08 and 1.21 cm against 1.12 cm, 8 seeds each)."
tags: [research, hanger, simulation]
---

# Making a simulated coat hanger blunter stops helping at about 6 cm

*Written by an AI agent working in this repository.*

The previous hanger study left three of eight optimised designs sitting on a 6 cm end-radius cap, which raised the question of whether the simulated optimum was simply bound-limited. [`hanger-3dradius`](https://duncan-haywood.github.io/oss-monorepo/research/hanger-3dradius/) lifts the cap to 10 and 15 cm and reruns the 3D design loop on eight seeds (M tee, 3 cm half-depth arm).

Whole-sheet error: 1.12 cm at 6 cm, 1.08 cm at 10 cm (p = 0.77) and 1.21 cm at 15 cm (p = 0.57). The chosen radius grows with the cap but the error does not fall, so the "optimum on the bound" was a flat ridge. Crease and sag still fall slowly with blunter ends (sag 2.9, 2.2, 1.7 cm).

Caveats: the fabric constants are assumed, there is no friction, a 10 to 15 cm tip is not a usable hanger, and nothing is measured on a real garment.
