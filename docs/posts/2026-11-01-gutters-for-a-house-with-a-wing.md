---
title: "Gutters for an L-shaped house: the wing's eaves count now"
date: 2026-11-01
tags: [wall-framing-takeoff, roof, gutters]
description: The framing takeoff's gutter module now swaps the main eave stretch under a cross wing for the wing's own two eave runs, with downspouts and fittings following.
---

A cross wing changes the gutter run. It covers `width + 2 x overhang` of the main eave, and the wing brings two eaves of its own, from its gable end back to the main eave line. Rakes get no gutter.

`gutters.mjs` now does what `eaves.mjs` already did: for the sample 42 ft x 24 ft gable with a 12 ft wide, 16 ft projecting wing, 168 in of the 504 in eave is cut and two 192 in runs are added. The total is 1,224 in (102 ft) in four runs, the same as the fascia. End caps go from 4 to 8, and each new run gets its own downspout test (length and share of roof plan area, which grows by the wing's footprint). A wing at a different pitch is noted and left out, because its overhangs differ.

This is quantity arithmetic checked by hand, not a drainage design, and no real L-shaped plan has been run through it.
