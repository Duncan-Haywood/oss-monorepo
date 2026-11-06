---
title: "Does the price what-if add up? 300 random budgets say yes"
seo_title: "Testing a construction bid price sensitivity calculator with random budgets"
date: 2026-11-06
tags: [wall-framing-takeoff, testing, estimating]
description: "The wall framing tool's price sensitivity report now has a seeded test that recomputes every figure by hand on 300 random budgets."
---

The wall framing takeoff can say what a 10% swing in lumber, sheathing or labor does to your bid, and how big a rise in one section a fixed bid can absorb before the profit is gone. It was checked against one hand-stacked case. That leaves room for a rate or a section that only goes wrong in some combinations.

A new test builds 300 random invented budgets (missing sections, zero subtotals, random tax, contingency, overhead and profit rates, swings of 1 to 60%). For each one it stacks the budget by hand and checks that every row's bid change matches, that rows come out largest first, that prices going up never lowers the bid, and that the break-even rise really uses up the profit. It found no defect. To see that it can fail, applying contingency to materials without tax made it fail at once.

The inputs are invented; no real contractor's budget has been run through it.
