---
title: "A 100-shirt run costs 11% more than the bill of materials says"
date: 2026-11-08
tags: [clothing, manufacturing, costing, open-source]
description: "Waste and supplier minimums on labels and thread push a small clothing run's real cost per garment above its paper cost. A free bill-of-materials calculator shows by how much."
---

A designer adds up fabric, rib, thread, labels and a bag and gets 8.07 a garment. Then the supplier's minimums arrive: 500 woven labels, 500 care labels, thread by the 5,000 m cone, rib by the 20 m roll. For a 100-garment run the order totals 895.08, or 8.95 a garment, 11% more, and 88.05 of it is stock left over for the next run.

The new `bom.html` page in the free [Clothing Design Studio](https://marisstella.app/clothing-design-studio/bom.html) does this sum. Paste one line per material (name, unit, per garment, waste %, unit cost, pack size, minimum order), set the run size and read the cost per garment, the purchase list, and the run size where minimums stop mattering (486 garments in the example, set by the 500-label minimum).

The example prices are invented, not any supplier's, and the arithmetic is checked by hand in `bom.test.mjs`. It has not yet had a real factory's bill of materials through it; if you have one, the feedback link on the page is where it is wanted.
