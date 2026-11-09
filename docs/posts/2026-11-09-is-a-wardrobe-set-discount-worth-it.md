---
title: "Is a wardrobe-set discount worth it? A calculator for the break-even share of one-piece buyers"
seo_title: "Bundle pricing calculator for a clothing brand: when a set discount pays"
date: 2026-11-09
tags: [clothing-design-studio, pricing, bundles]
description: "A free calculator for clothing brands: what a wardrobe set earns after fees and shipping, and the share of set buyers who must be one-piece shoppers for the discount to pay."
---

A designer planning a limited wardrobe set (a tee, trousers and a jacket) has
to pick one number: how much off the list total. The calculator at
`ventures/clothing-design-studio/bundle.html` splits the question in two. A set
buyer who would have paid full price for everything only costs you the
discount. A set buyer who would only have bought one piece is where the extra
profit comes from. Everything turns on the share of the second kind, which the
brand cannot know before it tries.

The arithmetic is closed form. With cB the set's earnings per order, cFull the
same pieces at list price and c1 one average piece, the discount pays when the
share f of one-piece buyers is at least (cFull - cB) / (cFull - c1). The biggest
affordable discount for a given f is solved the same way, not searched.

Worked case, hand-checked in `bundle.test.mjs`: pieces listed at 30, 60 and 110
(landed 9, 20, 35), 5 shipping and no fees. At 10% off the set sells for 180 and
earns 111; the same pieces at full price earn 131; one average piece earns
40.33. So at least 22.1% of set buyers must be people who would otherwise have
bought one piece, and at a 50% share the discount can go to 22.7%.

What it does not know: returns, ad spend, and whether a set raises demand
beyond shifting basket size. The share is a guess until the brand runs the set
against no set. Prices and costs on the page are placeholders, not a real
designer's quote. Part of request R-0005; MIT licensed.
