---
title: "A cross current leaves a boat a computable distance off its line"
date: 2026-10-30
tags: [marine-path, guidance, autonomous-boats]
description: "Plain line-of-sight steering in a 0.3 m/s cross current sits 3.77 m off the survey line, exactly as theory says; integral line-of-sight fixes it unless its gain is too high."
---

A small autonomous survey boat steered by plain line-of-sight (LOS) guidance never quite reaches its line in a cross current. The offset is `delta * tan(asin(c/U))`: 3.77 m for a 12 m look-ahead, 0.3 m/s current and 1 m/s boat speed. Our 3-degree-of-freedom simulation in `research/marine-path` reproduces that to within 1%.

Integral LOS removes the offset, and in 136 of 144 swept cases with current of at least 0.2 m/s it has the lower rms cross-track error. The 8 exceptions share one setting: a 6 m look-ahead with integral gain 2, where the loop oscillates by about 2.3 m even in still water.

The boat's damping, rudder and wave-force coefficients are placeholders, not sourced, so the ranking is a model property until it meets logged tracks. Next: source the coefficients, a JONSWAP sea, and an MPC arm. Code and table: [`research/marine-path`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-path).
