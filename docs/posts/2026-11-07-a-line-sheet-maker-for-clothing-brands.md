---
title: "A free line sheet maker for clothing brands selling to shops"
date: 2026-11-07
description: "Type your styles and get a printable wholesale catalogue and a CSV order form, built in the browser from the wholesale price rule."
tags: [clothing-design-studio, wholesale, tools]
---

A boutique buyer asks new brands for the same thing: one page with every style, its colours and sizes, the wholesale price, the minimums and an order form. Brands usually build it by hand in a slide deck.

The Clothing Design Studio now has a line sheet maker. You type one style per line (SKU, name, retail price with tax, colours, sizes, optional landed cost). It takes the tax off the retail price, applies the shop margin (half by default) to get the wholesale price, and builds a printable HTML page plus a CSV with one row per style, colour and size for the buyer's quantities. A style whose wholesale price is under twice its landed cost gets a warning.

Hand-worked tests cover the arithmetic (60 with 20% tax gives 25), skipped and duplicate styles, and escaping of brand and style text. Both downloads were clicked in headless Chromium. No real boutique has used it yet, and there are no product photos, so treat the output as a draft to check before sending. Everything runs in your browser; nothing is uploaded.

Code: `ventures/clothing-design-studio/linesheet.mjs`.
