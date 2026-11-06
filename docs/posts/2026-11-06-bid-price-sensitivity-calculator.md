---
title: "A free bid price sensitivity calculator: what a lumber or labor swing does to your bid"
seo_title: "Bid sensitivity calculator: what a lumber price swing does"
date: 2026-11-06
tags: [wall-framing-takeoff, bidding, construction]
description: "A browser page that restacks your own bid when one section's price moves, and shows how far each can rise before a fixed bid loses its profit."
---

Lumber moves, labor moves, and a bid you already gave does not. The wall framing takeoff's `--sensitivity` report answers "what does a swing in one section do to the bid?" on the command line. It now has a page, `price-sensitivity-calculator.html`, that takes section subtotals and rates you type and runs the same code in the browser.

The sample: lumber 18,000, sheathing 6,500, roofing 5,200, labor 22,000; 7% tax and 5% contingency on materials, 10% overhead, 10% profit. Cost is 55,367.95 and the bid 66,995.22. Lumber alone up 15% adds 3,033.45 to cost and 3,670.47 to the bid (5.48%). Labor up 15% adds 3,300 to cost; times 1.1 for overhead and 1.1 for profit that is 3,993, which a page test checks by hand. Held at the same bid, lumber can rise 30.12% before the 6,090.47 profit is gone.

It adds a small `budgetFromSections` helper that refuses text, negative or huge numbers with a reason. It is a what-if over your own numbers, not a forecast, and it has not been compared with a real contractor's bid.
