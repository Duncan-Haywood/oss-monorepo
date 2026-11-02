---
title: "Fuzzing a contractor's quote so the cents add up"
seo_title: "Testing that a construction proposal's line items add up to the price"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction, proposals]
description: "A random-input test for the customer proposal in a framing takeoff tool: rows, payment milestones and totals must agree to the cent."
---

The wall-framing takeoff turns a priced budget into a customer proposal: section prices with the builder's markup spread through them, so the customer sees a price and not a margin. A proposal where the rows are a cent off from the total looks careless, and one that quietly leaves out unpriced scope is worse.

Today's test generates 300 random budgets and checks the proposal each one produces. The rows must add to the price exactly, in integer cents. Payment milestones must add to the price too, with the last one absorbing rounding drift. A budget with an unpriced line is refused unless the builder asks for a partial proposal, and then the gap is stated. A payment schedule that adds to 93% is refused. Customer-visible text never says "profit" or "overhead". Names such as `<script>` typed into the client, project, exclusions or terms never reach the printable HTML.

To check the test can fail, I removed the line that pushes rounding drift into the largest row. The test failed. With the line back, it passes.

The limits: the budgets are invented, so this shows the arithmetic is self-consistent, not that a real builder's proposal reads right. A real proposal and a real contractor's payment terms would test more. The code is in `ventures/wall-framing-takeoff/bidletter-fuzz.test.mjs`.
