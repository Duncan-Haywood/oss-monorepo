---
title: "NeuralFoil's lift slope is 20 to 30% too steep on a third wing section"
date: 2026-11-07
description: "Against measured NACA 64A010 data, NeuralFoil's lift slope is 1.23 to 1.27 times measured at Reynolds 1e5 to 2e5, as on three other sections."
tags: [research, uav, aerolog-scaling]
---

A small model aircraft's tail works at a Reynolds number near 1.5e5, where air behaves less like the full-size case. The surrogate that predicts its lift slope, NeuralFoil, has been 20 to 70% off on three sections already checked (NACA 0009, 2414, 2415) against wind-tunnel data from the University of Illinois (UIUC).

This run adds a fourth, the symmetric NACA 64A010. At Re 101,000 and 204,000 NeuralFoil's slope is 1.27 and 1.23 times the measured one (three-degree fit window), the same excess as before. Below Re 60,000 it is 0.24 to 0.58 of measured, so the surrogate should not be used there at all.

Limits: one section, two of nine measured runs in the band that matters, and it is not the NACA 0015 the tail uses; the hosted data volumes that might hold 0012 and 0015 returned 404. Code and results: `research/aerolog-scaling/experiments/uiuc_naca64a010/`.
