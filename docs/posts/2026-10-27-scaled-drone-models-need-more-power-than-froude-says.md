---
title: "A 1:10 model of a cargo drone needs about a quarter more power than scaling laws predict"
seo_title: "A 1:10 cargo drone model needs a quarter more power than scaling says"
date: 2026-10-27
description: "First result of the aerolog-scaling programme: Froude scaling keeps trim and dynamics, but Reynolds number falls as n^1.5 and drag rises."
tags: [aerolog-scaling, research, uav, scaling]
---

Sub-scale models are how cargo and delivery aircraft get tested cheaply. [aerolog-scaling](../../research/aerolog-scaling/) opens a research programme on what such a model tells you about the full-size aircraft. The first step is a stdlib calculator and a flat-plate drag estimate for a 1,000 kg, aspect-ratio-10 fixed-wing: at 1:10 the model needs 1.27 times the power that Froude scaling predicts (1.17 to 1.35 across drag and aspect-ratio sweeps), and L/D drops from 22.8 to 18.0, because Reynolds number falls as n^1.5.

This is a first-order estimate only: no airfoil polars, fixed powertrain efficiency, and an untripped laminar variant that wrongly flatters small models. The citations are from memory and were not machine-checked (the registries returned 403). The next steps are a vortex-lattice model, XFOIL polars against measured data and propeller efficiency from the UIUC database.
