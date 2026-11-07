---
title: "Fuzzing the gravel and mulch estimator"
date: 2026-11-07
description: "A seeded 400-case property test for the wall-framing project's bulk material engine found no defect and now pins its volume, weight, bag and cost arithmetic."
tags: [testing, wall-framing-takeoff, construction]
---

The wall-framing project's bulk material engine (gravel, mulch, topsoil: cubic yards, tons, bags) was one of the last modules without a seeded property test. We added one: 400 random invented jobs, some deliberately hostile (zero or text sizes, unknown materials, 201 areas). Each is refused with a reason or recounted independently, checking volume, order yards, quarter-yard rounding, weight, bag counts and cost.

Result: no defect. The test now pins the engine so a later change to compaction, waste or rounding fails loudly. All inputs are invented; no supplier ticket was checked.
