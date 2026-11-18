---
title: "The EU 10,000 euro VAT line, as a free calculator for clothing brands"
date: 2026-11-08
tags: [clothing, tax, eu, tools]
description: "A free page that checks whether a clothing brand selling across EU borders has passed the 10,000 euro VAT line, and what shoppers' rates cost per 100 euros."
---

A small clothing brand selling from Germany to France and Italy may charge German VAT on those sales until they pass 10,000 euros a year, before VAT, all other EU countries added together. After that each shopper's own country's rate applies, and the seller files it through the One-Stop Shop (OSS) in its home country. The Clothing Design Studio had a US sales-tax page but nothing for the EU side of a Europe-and-US line, so it now has one: `eutax.html`.

You type the home country and sales by destination. It shows how far along the line you are, which countries' rates apply to the part above it, and what is left of a 100 euro shelf price if you keep the price and the higher rate is charged (Germany to Hungary: 93.70). Last year's total also counts, since the line applies to either year.

Limits: the 27 standard rates are typed from memory and not checked against the Commission's table, because the build host could not reach it. Sales above the line are split between countries by share, since there are no order dates. Reduced and zero rates for children's clothing are overrides only. A seller outside the EU gets the Import One-Stop Shop note (parcels up to 150 euros), not a calculation. Six hand-worked tests pass and the page ran in headless Chromium with no console errors. Code: `ventures/clothing-design-studio/eutax.mjs`.
