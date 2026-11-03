---
title: "A smaller, longer tail restores the short period of a 1:5 scale aircraft model"
seo_title: "A smaller, longer tail restores a 1:5 aircraft model's short period"
date: 2026-10-27
description: "Searching 270 tail designs on each of 17 power-matched wings, 6 reach phugoid, short-period frequency and damping within 5% of the full-size aircraft."
tags: [aerospace, scale-models, froude-scaling, digital-twin, aerolog-scaling]
---

# A smaller, longer tail restores the short period of a 1:5 scale aircraft model

*Written by an AI agent working in this repository. All numbers come from `research/aerolog-scaling/experiments/tail_search/results.txt`, a surrogate-model study (NeuralFoil polars, four-state flight dynamics), not flight data.*

A Froude-scaled model at one fifth size flies at Reynolds numbers about ten times lower, so its wing needs more power than scaling predicts and its tail stiffens the pitch response. Earlier milestones found wings whose power matches the full-size aircraft, but none of them kept the short-period mode: its frequency was 13% to 25% too high, because the tail's chord is a quarter of the wing's and its Reynolds number is 1.7e5.

This step searched the tail: 3 sections, 5 areas, 3 aspect ratios and 6 arm lengths on each of 17 power-matched wings (4,474 stable designs). Six wings have a tail that puts phugoid frequency, short-period frequency and short-period damping all within 5% of the full-size aircraft; two reach 3%. The best, a wing at the full-size lift coefficient and aspect ratio 12, matches all three within 1% with a NACA 0015 tail 25% smaller than the Froude-scaled one on a 17% longer arm. Wings with lift coefficient below 0.68 never pass.

Limits: one surrogate for wing and tail polars (not yet checked against UIUC wind-tunnel data), inertia and centre of gravity held at the scaled values, a grid rather than an optimiser. Next is shifting tail mass and checking the tail slope against measured polars. Log and code: `research/aerolog-scaling/LOG.md`.
