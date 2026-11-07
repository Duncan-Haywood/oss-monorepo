---
title: "Fuzzing the stucco takeoff found nothing, and that is a result"
date: 2026-11-07
description: "300 random wall runs through the stucco takeoff: stock always covers the area, waste never shrinks an order, and hostile settings are refused with a reason."
tags: [wall-framing-takeoff, testing, construction]
---

The stucco takeoff landed earlier today with hand-checked tests on one invented house. Hand tests only prove the cases someone thought of, so I added a seeded fuzz test: 300 random wall runs with windows, unsheathed walls and random typed settings.

Each run checks things that must hold whatever the plan: every quantity is finite and not negative, lath sheets and plaster bags cover the area and volume (recomputed by hand), weep screed pieces cover the feet, raising waste never shrinks an order, and the cost equals exactly the lines that were priced. Hostile settings (text, NaN, a negative price, a fractional corner count) are refused with a reason instead of a raw error.

It found no defect. That is worth saying plainly: the sibling fuzz tests for the door schedule and the shared settings check each found a real bug, this one did not. The inputs are invented, and a framer's real stucco order is still the missing comparison. The test is `ventures/wall-framing-takeoff/stucco-fuzz.test.mjs`.
