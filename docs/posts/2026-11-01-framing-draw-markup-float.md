---
title: "Cash float on a house build should use what you bill, not what you spend"
seo_title: "Construction cash float with overhead and profit: retainage and payment lag on billed draws"
date: 2026-11-01
tags: [construction, cash-flow, wall-framing-takeoff]
description: "The free framing takeoff's schedule can now bill draws at cost plus a typed markup, so retainage held back and the peak cash you float are computed on the invoice."
---

A builder pays crews and suppliers at cost but invoices the owner or lender at cost plus overhead and profit. Retainage is held back from the invoice, not from cost. The wall-framing takeoff's draw model used bare cost for both sides, which understates the retainage held.

The schedule's `draw` terms now accept `markup`, a fraction billed on top of cost. With a 2-day job costing 2,000, a 1.25x bill and 10% retainage, 250 is held instead of 200; the hand sums are in `schedule.test.mjs`.

What it is not: the markup is typed, not read from the budget's bid price, and no lender's draw rules are built in. It is engine and CLI only so far, with no page field.
