---
title: "A cart for shops that only have payment links"
date: 2026-11-08
tags: [clothing-design-studio, storefront, payments, open-source]
description: "The Clothing Design Studio's generated shop now has a cart even when each piece sells through its own Stripe or PayPal payment link."
---

The shop file the Clothing Design Studio generates had a basket only for order-by-email shops. A designer who pasted a payment link per piece got a Buy button and nothing else, so a buyer who wanted two pieces had no list to work from.

A shop with payment links now gets "Add to cart". Lines merge by size, the cart totals them, and each line carries a "Check out" link to that piece's own link. Payment links are one product each, so the buyer pays piece by piece; the page says so rather than implying a single checkout. The file still holds no keys, takes no payments and loads nothing from other sites.

Checked with a unit test on the markup and a headless-Chromium click-through (add twice gives 2 x and the doubled total, remove hides the cart). No real designer has deployed a shop yet, so how buyers handle several checkouts is unmeasured.
