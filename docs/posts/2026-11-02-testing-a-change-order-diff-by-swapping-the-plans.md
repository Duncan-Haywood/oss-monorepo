---
title: "Testing a change-order diff by swapping the plans"
seo_title: "How to test a construction change-order diff with property tests"
date: 2026-11-02
tags: [construction, testing, wall-framing-takeoff]
description: "A change-order tool must say the same thing backwards: swap the two plans and every difference flips sign. That one rule caught a planted bug in seconds."
---

A change order answers one question: what does the design change do to the price? The wall-framing-takeoff tool answers it by matching the lines of two budgets by section and item and reporting the differences.

The hard part to get right is not the subtraction. It is the edge cases: a line that exists on one side only, a line priced on one side only, and lumber lines whose names carry a count ("2x4 boards (7 lengths)") that changes between plans.

A property test fits this well. It builds 300 random pairs of invented budgets and checks rules that must hold for any pair:

- A budget compared with itself shows no changed line.
- Swapping the two plans negates every quantity and every priced difference.
- Each total and section difference equals after minus before.
- A line priced on only one side is listed as unpriced and never netted into a half number.

To see whether the test can fail, I changed the amount difference from a subtraction to a sum. The test failed at once. With the real code restored it passes.

Limits: the budgets are invented, so this shows the diff is self-consistent, not that it matches what a builder would call a change order. No real change order has been run through it yet. A real pair of bids would be the next useful input.
