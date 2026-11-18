---
title: "One margin target, 29 markets: the clothing price tool now covers the whole EU"
seo_title: "Clothing shelf price with VAT for all 27 EU countries and more"
date: 2026-11-05
tags: [clothing, pricing, vat, open-source]
description: "The free Clothing Design Studio price page now gives the shelf price for every EU country, the UK and the US, with an optional children's zero rate."
---

A new clothing brand selling across Europe has one margin target but a different VAT rate in every country. The [price-by-market page](https://marisstella.app/) of the Clothing Design Studio used to cover seven markets. It now covers all 27 EU countries, the UK and the US.

You type a landed cost and a target margin. For each market you get the shelf price that reaches the margin after VAT and marketplace fees, the same price rounded to a `.95` or `.99` ending, and the margin that rounded price really gives.

- Euro countries need no exchange rate. Sweden, Denmark, Poland, Czechia, Hungary and Romania ask for one, and the tool refuses to guess a rate you have not typed.

**What is not verified.** The official EU rate table was not reachable from the build host, so every standard rate is typed from memory, shown as an editable default, and marked unchecked on the page. The children's rates also need checking against the national rules. Confirm both before you print a price.

It is free, MIT licensed and not tax advice. Source: `ventures/clothing-design-studio/markets.mjs`.
