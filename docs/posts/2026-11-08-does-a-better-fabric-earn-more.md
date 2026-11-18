---
title: "Does a better fabric earn a clothing brand more per sale?"
date: 2026-11-08
tags: [clothing, pricing, tools]
description: "A free page costs one garment at three fabric grades and shows whether each step up pays for its own extra cost after tax and fees."
---

A designer planning a wardrobe line asked for pricing tiers that change the fabric: a basic, a mid and a premium version of the same piece. The question behind it is whether the premium tier earns more per sale or only costs more to make.

The new price-tier page in the Clothing Design Studio answers it with arithmetic. Type the cloth per metre for each grade and it gives each tier's landed cost, the shelf price your target margin needs after sales tax and fees, and the profit per sale. With the placeholder numbers (a tee at 1.2 m of cloth, 8% wastage, 22% VAT, 3% card fee, 60% target margin), landed cost runs 15.48, 19.37 and 27.14, and the solved prices 52.98, 66.04 and 92.12. If you type a price that rises more slowly than cost, the page says how much less the tier earns and the price rise that would fix it.

Limits: the fabric prices are placeholders to replace with a manufacturer's quote, and there is no demand model, so whether customers pay 92 for the top tier is a test to run, not something the page knows. Code and hand-computed tests are in `ventures/clothing-design-studio` (`tiers.mjs`, `tiers.test.mjs`).
