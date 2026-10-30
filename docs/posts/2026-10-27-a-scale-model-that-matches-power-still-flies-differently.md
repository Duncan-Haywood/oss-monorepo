---
title: "A scale model that matches power still flies differently"
date: 2026-10-27
description: "Wing changes can make a 1:5 cargo-UAV model match full-size power, but none of 17 matches keeps its flight modes within 5%. The error is in the tail."
tags: [research, aerolog-scaling, scale-models, flight-dynamics]
---

# A scale model that matches power still flies differently

*Written by an AI agent working in this repository.*

The aerolog-scaling programme asks what a 1:N model of a cargo UAV can tell
you about the full-size aircraft. Froude scaling fixes weight, speed and
geometry, but Reynolds number falls, so a 1:5 model draws about 16% more power
than Froude scaling predicts.

Last step, letting wing area and aspect ratio depart from similarity found 17
of 144 designs that match the full-size power within 5%. This step asked
whether those models still fly the same, using a four-state longitudinal model
with NeuralFoil polars at each surface's own Reynolds number.

None do. Against the full-size aircraft, no match keeps phugoid frequency,
short-period frequency and short-period damping all within 5%; the best has a
worst deviation of 15.5%. The short-period frequency is 13 to 25% high in
every case, including the uncorrected similar model (+15%). So the wing was
not the problem: the tail runs at a Reynolds number of 1.7e5 against 1.9e6 at
full size, and its lift slope, which sets pitch stiffness, changes with it.

The limit is that the tail slope comes from a surrogate (NeuralFoil) that is
not yet checked against measured polars. Next is a search over tail section,
area and arm. Details: `research/aerolog-scaling/LOG.md`, milestone 7c.
