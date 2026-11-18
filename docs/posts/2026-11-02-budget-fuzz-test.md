---
title: A fuzz test for the wall-framing budget
date: 2026-11-02
tags: [wall-framing-takeoff, testing, budget]
description: 300 seeded random takeoffs, prices and allowances check that the budget adds up and never invents a price.
---

The wall-framing-takeoff budget now has a seeded property test. It builds 300 random takeoff results with random typed prices (some missing, negative or not numbers) and random allowances, then checks that every line is quantity times price, the sections and totals add up from the lines, an unusable price prices nothing and is listed as unpriced, the bid never falls below cost, and the text and CSV outputs render. It passed on the first run, so the budget code needed no change. The test sits beside the 19 other fuzz tests in `ventures/wall-framing-takeoff/`.
