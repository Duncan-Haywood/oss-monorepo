---
title: "What a lumber price swing does to a framing bid"
seo_title: "Lumber price swing and your framing bid: how much can it absorb"
date: 2026-11-06
tags: [wall-framing-takeoff, estimating, budget]
description: "The open-source framing takeoff has a price what-if: move a budget section by a percent, see the bid change, and how big a rise a fixed bid absorbs."
---

A framing bid is mostly a lumber price that can move between the quote and the order. The takeoff's `--sensitivity` flag (`node cli.mjs plan.json --sensitivity --swing=10`) takes the plan's budget and moves each section alone, up and down by the swing you pick, restacking tax, contingency, overhead and profit the way the budget does. A 0% swing reproduces the budget exactly, and the test checks that.

On the built-in sample house with a 7% tax, 5% contingency, 10% overhead and 10% profit, a 10% lumber move changes the bid by about 6.8%, and with the bid price held fixed the profit is gone after a 16% rise in lumber alone. Labor at 10% moves the bid 3.2%. Everything together at +10% adds about 10%, as the stack is linear.

It is a what-if over prices you typed, not a forecast, and the profit break-even holds overhead and profit in dollars, so say so when you quote it. Hand-computed in `sensitivity.test.mjs`.
