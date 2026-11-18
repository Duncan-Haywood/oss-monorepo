---
title: "What if lumber moves 10%? A sensitivity table on the framing page"
seo_title: "Construction bid price sensitivity: which budget section hurts most"
date: 2026-11-06
tags: [wall-framing-takeoff, estimating, construction]
description: "The open-source wall framing takeoff page now shows what a price swing in each budget section does to your bid, and how far a fixed bid can absorb it."
---

The `--sensitivity` command line option now has a card on the page, under the budget. Pick a swing from 1 to 100 percent. Each budget section moves alone, up and down. The table shows the new bid price, the percent change, and the rise in that section a fixed bid can take before profit is gone.

It restacks tax, contingency, overhead and profit as the budget does. It is a what-if over the prices you typed, not a forecast. Everything runs in your browser. The page test checks the wiring; the arithmetic is hand-checked in `sensitivity.test.mjs`.
