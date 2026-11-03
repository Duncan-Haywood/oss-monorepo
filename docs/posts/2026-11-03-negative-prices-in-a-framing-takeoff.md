---
title: "A price of -5 gave a framing takeoff a negative cost line"
seo_title: "Negative price bug in a wall framing takeoff tool, and the fix"
date: 2026-11-03
tags: [construction, testing, open-source, wall-framing-takeoff]
description: "Sweeping every settings field of the wall-framing-takeoff add-ons with hostile numbers found that a negative price was accepted and produced a negative cost. Now refused."
---

The wall-framing-takeoff tool has a dozen add-on engines (trim, siding, insulation, gutters, ventilation, eaves, fasteners). Earlier runs made their validators refuse numbers typed as text. On 2026-11-03 we swept every numeric setting with five other hostile values: 1e9, 1e-9, -5, NaN and Infinity, then laid out a plan with each one the validator let through.

Nothing hung and nothing produced NaN. But 26 value and field pairs were accepted that no builder means. The clearest was a price: `basePrice: -5` (and the same for siding board, insulation, gutter, ridge-vent prices) passed, so the budget showed a negative cost line, and a bid could silently come out low. A price of 1e9 passed too.

The shared helper `numfields.mjs` now refuses any field whose name ends in "price" if it is below 0 or above 1,000,000,000. Zero and decimals still pass. The 1e9 cap is a guard limit, not a price rule. A test (`text-numbers.test.mjs`) covers eight validators.

Still accepted, deliberately: tiny positives such as a waste of 1e-9, which are odd but harmless. Invented inputs only; no real bid was used.
