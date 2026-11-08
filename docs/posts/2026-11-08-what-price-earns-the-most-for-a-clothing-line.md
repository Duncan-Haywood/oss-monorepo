---
title: "What shelf price earns a new clothing line the most?"
date: 2026-11-08
tags: [clothing-design-studio, pricing, small-business]
description: "A price-test calculator for independent designers: two weeks of sales at two prices give the best shelf price after VAT, fees and cost."
---

A first-time designer usually sets a price from the cost of the shirt and a hunch. A cheaper way to learn is to sell at one price for a week, another the next, and write down the sales.

The Clothing Design Studio now has `pricepoint.html` for that. Two readings, say 30 sales at 40 and 19 at 50, give the price elasticity (here about 2.05: sales fall 2% for each 1% price rise). With the landed cost, card fees and VAT typed in, it finds the price with the most profit. For the page's example that is 36.20, or 35.99 on a shelf, about 525 profit against 520 at the starting price.

The check is the closed form: with elasticity e and no fixed cost, the best price is e/(e-1) times the cost per piece after tax and fees. The unit tests compare the scan against it (e=2 and cost 15 give 30) and hand-work a 64-sale, 30-per-piece case.

The page also shows how the answer moves for elasticities from 1.2 to 4, because two readings do not fix a curve. If sales rose with price, or the best price is far from any price tested, it says so instead of printing a number.

Limits: placeholder costs, a constant-elasticity curve that ignores price thresholds, and no designer has run a real price test through it yet.
