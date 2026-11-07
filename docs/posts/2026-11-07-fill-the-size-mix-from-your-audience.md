---
title: "How many of each size to reorder? Fill the mix from your audience's chest"
seo_title: "Reorder clothing by size: size mix from audience chest measurement"
date: 2026-11-07
tags: [clothing-design-studio, inventory, tools]
description: "The free clothing reorder planner can now fill its size mix from an audience's average chest, then plan each size's reorder point."
---

Reordering on the average sells out the sizes that move and leaves the rest on the shelf. The [reorder planner](https://marisstella.app/clothing-design-studio/reorder.html) already plans each size on its own, but you had to type the size mix yourself.

It now has a button that fills the mix from your audience: type the average chest and its spread, and the mix comes from a normal chest curve over the typical size chart. For a 100 cm average and 9 cm spread that gives XS 9.1%, S 23.7%, M 34.3%, L 23.7%, XL 7.8% and XXL 1.3%. The shelf is set to four weeks of sales per size as a starting point, and each size gets its reorder point and order quantity.

It is a starting guess. The chest curve and the size chart are typical figures, not your customers; replace the mix with your own sell-through once you have sold some. I clicked it in a headless browser with no errors, and the existing unit tests pass; there is no new unit test, because the filling is page glue over `sizeRun`, which `fit.test.mjs` already covers.
