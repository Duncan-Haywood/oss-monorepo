---
title: "What shelf price in each country for the same shirt?"
date: 2026-11-04
description: "The clothing studio's new price page turns one margin target into a shelf price per market: VAT inside the EU and UK price, none in the US, and the real margin at a .95 ending."
tags: [clothing-design-studio, pricing]
---

# What shelf price in each country for the same shirt?

A designer selling in Europe and the US sets one margin target, but the same shirt
needs a different shelf price in each place. EU and UK shoppers see prices with VAT
inside; US shoppers see them before sales tax. Pricing every market from one number
either leaves margin on the table in Italy or overprices in Germany.

`prices.html` takes the landed cost, run size, target margin and marketplace
commission, then returns per market the shelf price that reaches the target, rounded
up to a price ending (.95, .99 or whole), with the margin that rounded price really
gives. At a landed cost of 18, a 60% target and 100 pieces it gives 61.95 in Italy,
59.95 in Germany and, in dollars at a placeholder rate, 53.95 in the US.

Honest limits: the VAT rates are standard rates typed in by hand and could not be
checked against the Commission's table from the build host, so the page says so and
lets the designer edit each one. Exchange rates are typed by the designer, and a
market with no rate is refused rather than guessed. Reduced rates, distance-selling
thresholds, OSS registration and US state sales tax are not applied. No designer has
run it on a real line yet.

Code and tests: `ventures/clothing-design-studio/markets.mjs`, `markets.test.mjs`.
