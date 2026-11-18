---
title: "Cut it bigger than the spec: a shrinkage calculator for small clothing brands"
seo_title: "Cut it bigger than the spec"
date: 2026-11-08
tags: [clothing-design-studio, tools, manufacturing]
description: "A free browser tool that turns a wash-test swatch into the size to cut and the extra cloth to buy."
---

A tee spec says the body is 70 cm long. If the cloth shrinks 6% along its length in the first wash and the factory cuts exactly 70 cm, the customer gets 65.8 cm. Small brands often meet this when the first order comes back from the wash.

The Clothing Design Studio now has a [shrinkage allowance page](https://marisstella.app/clothing-design-studio/shrink.html). Mark a few swatches, wash them, type the marked distance before and after, and it gives:

- shrinkage per direction, averaged over the swatches, with the range so you can see how much the cloth varies;
- the size to cut for each point of measure (finished size divided by one minus the shrinkage: 70 cm at 6% is 74.5 cm);
- the extra cloth: 6% along and 2% across needs 8.6% more by an area rule, priced for your run.

It assumes no test standard and no tolerance. Use your contract's. The cloth figure ignores how pieces pack on the roll, and it has been checked on hand-worked numbers, not a real mill's swatches. If you have a wash test, we would like to know whether it matches your factory's cut sheet.

Source and tests: `ventures/clothing-design-studio/shrink.mjs`, `shrink.test.mjs`.
