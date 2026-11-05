---
title: "Clothing price page now checks the EU EUR 10,000 cross-border threshold"
seo_title: "Clothing price page checks the EU EUR 10,000 threshold"
date: 2026-11-05
description: "A small addition to the Clothing Design Studio price-by-market page: type your EU cross-border sales and see whether destination VAT applies."
tags: [clothing-design-studio]
---

# Clothing price page now checks the EU EUR 10,000 cross-border threshold

A small EU clothing brand selling to shoppers in other EU countries can charge its
home VAT until its cross-border sales pass EUR 10,000 a year; after that each
shopper's own country's VAT applies, usually via the One-Stop Shop. The price page
now has a box for this year's sales, last year's and the plan, and says under,
will cross, or over. `ossThreshold` in `markets.mjs` is the function behind it.

It is a summary of the rule for sellers established in one EU country, not tax
advice, and it was checked only against unit tests, not a real seller's books.
