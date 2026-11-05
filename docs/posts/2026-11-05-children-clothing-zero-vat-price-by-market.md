---
title: "Pricing children's clothing: why the UK and Ireland shelf price drops"
seo_title: "Children's clothing VAT: zero-rated in the UK and Ireland"
date: 2026-11-05
tags: [clothing, pricing, vat, tools]
description: "Children's clothing can be zero-rated in the UK and Ireland, so the shelf price drops. How the price-by-market page now handles it."
---

A clothing brand that sells in Europe sets one margin target, but the shelf price that reaches it depends on the market's VAT. For adult clothing that is the standard rate: 23% in Ireland, 20% in the UK and France. For children's clothing the UK and Ireland can charge 0%, with conditions on age and size, so the same landed cost and the same margin give a noticeably lower shelf price there.

The [price by market page](../../ventures/clothing-design-studio/prices.html) of the Clothing Design Studio now has a "Garments for" choice. Pick children and the UK and Ireland rows drop to 0% VAT, while France, Germany and the rest keep their standard rate. Ireland is a new row. Edit any rate by hand and your edit wins.

The rates were typed from memory and are **not verified** against HMRC or Revenue. The page says so, and the zero rate only applies if the garments meet the official conditions, so check before you print a price tag. The tests are in `markets.test.mjs`.
