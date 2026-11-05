---
title: "What happens to the shirts that do not sell"
seo_title: "Clothing markdown plan: sell-through and unsold stock calculator"
date: 2026-11-05
tags: [clothing-design-studio, costing, product]
description: "The clothing design studio now models a markdown ladder: how much sells at full price, what each discount recovers after tax and fees, and what is left."
---

Most small clothing costings assume the whole run sells at one price. It rarely does. The first weeks sell at full price, then the designer cuts 30%, then 50%, and some pieces are still in a box at the end.

The [clothing design studio](../../ventures/clothing-design-studio/index.html) has a new "Unsold stock" section. Type how many you sell a week at full price, how many full-price weeks, and a ladder of markdowns ("30, 4" means 30% off for 4 weeks). It shows the share sold at full price, the sell-through, the units left, and the profit after the ladder. Tax and fees come off each marked-down price, and a sale that loses money per unit is flagged rather than hidden.

The demand model is a stated guess: a discount lifts weekly sales by (full price / sale price) to the power of an elasticity, 2 by default, editable. It is a placeholder until a designer has real sales, and the page says so. With the default example (4 sales a week, 8 full-price weeks, 30% then 50% off) the run sells out, but only about a third at full price, which is the number a first-time designer most wants to see before ordering 100 pieces.

The code is `clearance.mjs` with hand-checked tests; it is MIT licensed like the rest of the repo.
