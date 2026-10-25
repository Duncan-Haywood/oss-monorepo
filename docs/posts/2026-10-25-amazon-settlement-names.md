---
title: "Seven Amazon settlement lines our bookkeeper filed under the wrong heading"
date: 2026-10-25
description: "Checking ai-bookkeeper's Amazon payout reader against Amazon's own API model found seven charge and adjustment names booked as sales or fees by mistake."
tags: [ai-bookkeeper, accounting, amazon]
---

An Amazon settlement report is a list of lines such as `ItemPrice / Principal`
or `other-transaction / PostageBilling`. [ai-bookkeeper](../../ventures/ai-bookkeeper/)
sorts each into sales, refunds, tax, fees or other with word matching. We ran
every charge, adjustment and direct-payment name from Amazon's published
Selling Partner API Finances model through that sorter.

Seven were wrong. `PrivateLabelCreditCardRevenue` contains the word "label", so it
was booked as a fee. India's `TCS-CGST` tax collected at source and `PaymentMethodFee`
were booked as sales. Shipping-label postage fell to "other". Goodwill credits and
discounts on an order counted as sales. All are fixed and covered by a test.

This checks names against Amazon's documentation, not against a real seller's
file, and the model does not list fee-type names at all, so those still rely on
word matching. A real settlement export is still the missing piece.
