---
title: "Checking a wave-resistance code two ways, and why a form factor is a bracket"
seo_title: "Michell wave resistance Wigley hull check: independent integral and tank curve"
date: 2026-11-09
tags: [research, marine-hull, naval-architecture, validation]
description: "Our closed-form Michell wave resistance matches an independent dense integral within 0.01%, but a six-point tank curve implies a form factor anywhere from 0 to 0.5 until the model size is known."
---

The marine-hull programme ranks small survey craft by range per kWh, and its
catamaran verdict rests on Michell thin-ship wave resistance for a Wigley hull.
Until now that code had one outside check: a single tank point.

Two checks this session:

1. **Numerics.** The closed-form module agrees with a separate dense-grid
   evaluation of the original integral to 0.01% at ten Froude numbers from
   0.15 to 1.0. That tests the arithmetic, not the physics.
2. **A six-point curve.** Kajitani et al. (1983) total resistance, as tabulated
   by Ahmed and co-authors (2015) and read through a public MIT-licensed
   transcription, not the primary table. Subtract Michell wave resistance and
   ITTC friction and see what form factor k is left. The source does not give
   the model length, and the answer depends on it: about 0 at 1 m, +0.18 on
   average at 2 m, +0.44 at 4 m. Within one size k also wanders with Froude
   number, as thin-ship theory's exaggerated humps and hollows predict.

So the honest statement is a bracket, not a number. The checks do not change
the earlier verdict (a catamaran rarely out-ranges a monohull at survey speed),
and the primary table is still needed before this counts as validated.

Code, output and log: `research/marine-hull/` (milestone 3m).
