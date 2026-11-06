---
title: "What a clothing order earns after returns: a free calculator for small brands"
seo_title: "Clothing returns calculator: profit per order after refunds"
date: 2026-11-06
tags: [clothing-design-studio, ecommerce, calculators]
description: "Type a price, cost and return rate to see what a clothing order really earns, the break-even return rate, and the price that holds your profit."
---

A 50 tee that costs 15 to make, ships for 5 and pays 3% in card fees earns 28.20 an order if nobody sends it back. At a 20% return rate, refunding every return and paying 6 for the label and 2 for handling, it earns 19.60. At 25% returns with a third swapped for another size, the answer changes again, and nobody has the number in their head.

The new returns calculator in the Clothing Design Studio (`ventures/clothing-design-studio/returns.html`) works it out: refunds, size swaps (the sale stays but a second parcel goes out), resellable returns versus unsellable ones written off at a salvage value, the card fee that is not refunded, and return labels. Profit is linear in both the return rate and the price, so the break-even return rate and the price that holds a target profit are solved exactly, not searched. One point fewer returns is worth about 0.43 per order on the example above, which is the budget for a size guide.

It is arithmetic on numbers you type, runs in your browser, and is MIT licensed. Eight hand-computed test cases cover it; there is no real brand's return data behind it yet, and a real one is what would test the assumptions.
